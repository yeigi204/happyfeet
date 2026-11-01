import "server-only";

import { createHash } from "node:crypto";

import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { ageInYears, isAdult } from "@/lib/domain/age";
import { normalizeHandle, validateHandle } from "@/lib/domain/handles";
import { isPremiumActive } from "@/lib/domain/plans";
import type { Viewer } from "@/lib/domain/types";
import { assertActive } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { creatorProfiles, premiumSubscriptions, users, type User } from "@/server/db/schema";
import { ConflictError, ValidationError, zodFieldErrors } from "@/server/errors";
import { cancelAtProviders, stopBillingForUser } from "@/server/services/account-billing";
import { writeAudit } from "@/server/services/audit";

const OLDEST_PLAUSIBLE_AGE_YEARS = 120;
const REREGISTRATION_NOTE = "Neuanmeldung nach Sperre";

/**
 * Steuerzeichen (NUL bricht das DB-Update, Zeilenumbrüche das Layout) und Bidi-Steuerzeichen
 * (Namens-Spoofing mit U+202E u. a.). Emoji-Sequenzen mit ZWJ bleiben erlaubt.
 */
const UNSAFE_NAME_CHARS = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/;

/** Handle ist schon vergeben – eigene Klasse, damit die UI den Fehler dem Feld `handle` zuordnen kann. */
export class HandleTakenError extends ConflictError {
  constructor() {
    super("Dieser Handle ist schon vergeben.");
  }
}

// ─── Clerk-Synchronisation ────────────────────────────────────────────────────

/** SHA-256 der normalisierten E-Mail (für die Wiedererkennung gesperrter, gelöschter Konten). */
function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/**
 * Legt den Nutzer zur Clerk-ID an oder aktualisiert seine E-Mail (idempotent, race-sicher).
 * Profil, Onboarding, Admin-Recht und Sperre werden dabei nie angefasst; eine fehlende E-Mail
 * (`null`) überschreibt keine bekannte. Ein gelöschtes Konto bleibt anonym (verspätete
 * `user.updated`-Events setzen keine E-Mail zurück).
 * Taucht dabei (neu) eine E-Mail auf, die zu einem gesperrten, gelöschten Konto gehörte, startet das
 * Konto gesperrt – eine Sperre lässt sich nicht durch Löschen und Neuanmelden umgehen.
 * `imageUrl` wird bewusst nicht übernommen: Avatare laufen über den eigenen Storage (`avatar_key`).
 */
export async function upsertUserFromClerk(
  data: { clerkId: string; email: string | null; imageUrl?: string | null },
  opts: { now?: Date } = {},
): Promise<User> {
  const now = opts.now ?? new Date();
  const db = getDb();
  const [before] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.clerkId, data.clerkId))
    .limit(1);

  const [row] = await db
    .insert(users)
    .values({ clerkId: data.clerkId, email: data.email })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        email: sql`case when ${users.deletedAt} is null then coalesce(excluded.email, ${users.email}) end`,
        updatedAt: now,
      },
    })
    .returning();

  // Nur bei neuer Zeile oder geänderter E-Mail prüfen – sonst würde eine vom Admin aufgehobene
  // Sperre beim nächsten `user.updated` wieder gesetzt.
  const emailIsNew = !before || before.email?.toLowerCase() !== row.email?.toLowerCase();
  if (emailIsNew && row.email && row.status === "active" && row.deletedAt === null) {
    return (await carryOverBan(row, row.email, now)) ?? row;
  }
  return row;
}

/** Sperrt `user`, wenn ein gesperrtes, gelöschtes Konto dieselbe E-Mail hatte. `null`, wenn nicht. */
async function carryOverBan(user: User, email: string, now: Date): Promise<User | null> {
  const db = getDb();
  const [previous] = await db
    .select({ id: users.id, reason: users.bannedReason })
    .from(users)
    .where(
      and(eq(users.deletedEmailHash, emailHash(email)), eq(users.status, "banned"), isNotNull(users.deletedAt)),
    )
    .orderBy(desc(users.bannedAt))
    .limit(1);
  if (!previous) return null;

  const reason = previous.reason ? `${previous.reason} (${REREGISTRATION_NOTE})` : REREGISTRATION_NOTE;
  return db.transaction(async (tx) => {
    const [banned] = await tx
      .update(users)
      .set({ status: "banned", bannedReason: reason, bannedAt: now, updatedAt: now })
      .where(and(eq(users.id, user.id), eq(users.status, "active")))
      .returning();
    if (!banned) return null;
    await writeAudit(
      {
        actorId: null,
        action: "user.banned",
        targetType: "user",
        targetId: user.id,
        metadata: { reason, handle: banned.handle, source: "reregistration", previousUserId: previous.id },
      },
      tx,
    );
    return banned;
  });
}

/**
 * Clerk `user.deleted`: anonymisiert das Konto statt es zu löschen. Posts, Medien, Meldungen,
 * Zahlungen und Auszahlungen bleiben als Nachweis bzw. Buchhaltung dem Nutzer zugeordnet; E-Mail
 * und Geburtsdatum werden entfernt (von der E-Mail bleibt nur ein Hash, damit eine Sperre eine
 * Neuanmeldung überlebt), Handle und Anzeigename bleiben als öffentliches Pseudonym reserviert.
 * Laufende Abos (als Fan und Creator) und Premium werden zum Periodenende gekündigt. Ein gelöschter
 * Creator ist öffentlich unsichtbar; ein gelöschter Nutzer bekommt keinen Viewer mehr.
 * Idempotent (Svix-Wiederholungen); eine unbekannte Clerk-ID ist kein Fehler.
 */
export async function deleteUserByClerkId(clerkId: string, opts: { now?: Date } = {}): Promise<void> {
  const now = opts.now ?? new Date();
  const toCancelAtProvider = await getDb().transaction(async (tx) => {
    const [target] = await tx
      .select({
        id: users.id,
        email: users.email,
        status: users.status,
        handle: users.handle,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1)
      .for("update");
    if (!target || target.deletedAt) return [];

    await tx
      .update(users)
      .set({
        email: null,
        birthDate: null,
        deletedAt: now,
        deletedEmailHash: target.email ? emailHash(target.email) : null,
        updatedAt: now,
      })
      .where(eq(users.id, target.id));
    const stopped = await stopBillingForUser(tx, target.id, now);
    await writeAudit(
      {
        actorId: null,
        action: "user.deleted",
        targetType: "user",
        targetId: target.id,
        metadata: {
          handle: target.handle,
          wasBanned: target.status === "banned",
          canceledSubscriptions: stopped.canceledSubscriptions,
          canceledPremium: stopped.canceledPremium,
        },
      },
      tx,
    );
    return stopped.refs;
  });
  await cancelAtProviders(toCancelAtProvider, "users");
}

// ─── Viewer ───────────────────────────────────────────────────────────────────

/** Baut den Viewer zur Clerk-ID aus der DB (ohne Clerk-Aufruf). `null`, wenn der Nutzer unbekannt oder gelöscht ist. */
export async function findViewerByClerkId(clerkId: string, opts: { now?: Date } = {}): Promise<Viewer | null> {
  const now = opts.now ?? new Date();
  const db = getDb();

  const [row] = await db
    .select({ user: users, profile: creatorProfiles })
    .from(users)
    .leftJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  // Gelöschte Konten können nicht mehr handeln (Clerk beendet ihre Sessions ohnehin).
  if (!row || row.user.deletedAt) return null;
  const { user, profile } = row;

  let isPremium = false;
  if (profile) {
    const premiums = await db
      .select({ status: premiumSubscriptions.status, currentPeriodEnd: premiumSubscriptions.currentPeriodEnd })
      .from(premiumSubscriptions)
      .where(
        and(eq(premiumSubscriptions.creatorId, user.id), inArray(premiumSubscriptions.status, ["active", "canceled"])),
      );
    isPremium = premiums.some((p) => isPremiumActive(p, now));
  }

  return {
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    handle: user.handle,
    displayName: user.displayName,
    avatarKey: user.avatarKey,
    isAdmin: user.isAdmin,
    status: user.status,
    onboarded: user.onboardedAt !== null,
    creator: profile ? { verificationStatus: profile.verificationStatus, isPremium } : null,
  };
}

/** Grund und Zeitpunkt der Sperre des Viewers (für die Sperrseite); `null`, wenn nicht gesperrt. */
export async function getBanDetails(viewer: Viewer): Promise<{ reason: string | null; bannedAt: Date | null } | null> {
  const [row] = await getDb()
    .select({ status: users.status, reason: users.bannedReason, bannedAt: users.bannedAt })
    .from(users)
    .where(eq(users.id, viewer.id))
    .limit(1);
  if (!row || row.status !== "banned") return null;
  return { reason: row.reason, bannedAt: row.bannedAt };
}

// ─── Handles & Onboarding ─────────────────────────────────────────────────────

/** Gültig, nicht reserviert und noch frei? Eingaben wie „@Anna“ werden normalisiert. */
export async function isHandleAvailable(handle: string): Promise<boolean> {
  const normalized = normalizeHandle(handle);
  if (!validateHandle(normalized).ok) return false;
  const [taken] = await getDb().select({ id: users.id }).from(users).where(eq(users.handle, normalized)).limit(1);
  return !taken;
}

/** Volle Lebensjahre oder `null` bei ungültigem Datum (Format, Kalender, Zukunft, unplausibel alt). */
function plausibleAge(birthDate: string, now: Date): number | null {
  let age: number;
  try {
    age = ageInYears(birthDate, now);
  } catch {
    return null;
  }
  return age < 0 || age > OLDEST_PLAUSIBLE_AGE_YEARS ? null : age;
}

function onboardingSchema(now: Date) {
  return z.object({
    handle: z
      .string()
      .transform(normalizeHandle)
      .superRefine((handle, ctx) => {
        const result = validateHandle(handle);
        if (!result.ok) ctx.addIssue({ code: "custom", message: result.reason });
      }),
    displayName: z
      .string()
      .trim()
      .min(2, "Dein Name braucht mindestens 2 Zeichen.")
      .max(40, "Dein Name darf höchstens 40 Zeichen lang sein.")
      .refine((name) => !UNSAFE_NAME_CHARS.test(name), "Dein Name enthält unzulässige Zeichen."),
    birthDate: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        if (plausibleAge(value, now) === null) {
          ctx.addIssue({ code: "custom", message: "Bitte gib ein gültiges Geburtsdatum ein." });
          return;
        }
        if (!isAdult(value, now)) {
          ctx.addIssue({ code: "custom", message: "Du musst mindestens 18 Jahre alt sein." });
        }
      }),
    confirmAdult: z.literal(true, { error: "Bitte bestätige, dass du mindestens 18 Jahre alt bist." }),
  });
}

function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

/**
 * Schliesst das Pflicht-Onboarding ab (Handle, Anzeigename, Geburtsdatum, 18+-Bestätigung).
 * Wirft `ValidationError` (mit fieldErrors pro Feld) bzw. `ConflictError` bei vergebenem Handle
 * oder bereits abgeschlossenem Onboarding.
 */
export async function completeOnboarding(
  viewer: Viewer,
  input: { handle: string; displayName: string; birthDate: string; confirmAdult: boolean },
  opts: { now?: Date } = {},
): Promise<void> {
  assertActive(viewer);
  const now = opts.now ?? new Date();

  const parsed = onboardingSchema(now).safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Bitte prüfe deine Angaben.", zodFieldErrors(parsed.error.issues));
  }
  const { handle, displayName, birthDate } = parsed.data;

  const db = getDb();
  const [current] = await db
    .select({ onboardedAt: users.onboardedAt })
    .from(users)
    .where(eq(users.id, viewer.id))
    .limit(1);
  if (!current) throw new ConflictError("Dein Konto wurde nicht gefunden. Bitte melde dich neu an.");
  if (current.onboardedAt) throw new ConflictError("Dein Profil ist bereits eingerichtet.");

  if (!(await isHandleAvailable(handle))) throw new HandleTakenError();

  let updated: { id: string }[];
  try {
    // `onboarded_at IS NULL` im WHERE: bei doppeltem Absenden gewinnt genau ein Aufruf.
    updated = await db
      .update(users)
      .set({ handle, displayName, birthDate, ageConfirmedAt: now, onboardedAt: now, updatedAt: now })
      .where(and(eq(users.id, viewer.id), isNull(users.onboardedAt)))
      .returning({ id: users.id });
  } catch (error) {
    // Zwei gleichzeitige Anmeldungen mit demselben Handle: der eindeutige Index entscheidet.
    if (isUniqueViolation(error)) throw new HandleTakenError();
    throw error;
  }
  if (updated.length === 0) throw new ConflictError("Dein Profil ist bereits eingerichtet.");
}

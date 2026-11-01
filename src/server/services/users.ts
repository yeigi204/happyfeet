import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { ageInYears, isAdult } from "@/lib/domain/age";
import { normalizeHandle, validateHandle } from "@/lib/domain/handles";
import { isPremiumActive } from "@/lib/domain/plans";
import type { Viewer } from "@/lib/domain/types";
import { assertActive } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { creatorProfiles, premiumSubscriptions, users, type User } from "@/server/db/schema";
import { ConflictError, ValidationError, zodFieldErrors } from "@/server/errors";

const OLDEST_PLAUSIBLE_AGE_YEARS = 120;

/** Handle ist schon vergeben – eigene Klasse, damit die UI den Fehler dem Feld `handle` zuordnen kann. */
export class HandleTakenError extends ConflictError {
  constructor() {
    super("Dieser Handle ist schon vergeben.");
  }
}

// ─── Clerk-Synchronisation ────────────────────────────────────────────────────

/**
 * Legt den Nutzer zur Clerk-ID an oder aktualisiert seine E-Mail (idempotent, race-sicher).
 * Profil, Onboarding, Admin-Recht und Sperre werden dabei nie angefasst; eine fehlende E-Mail
 * (`null`) überschreibt keine bekannte.
 * `imageUrl` wird bewusst nicht übernommen: Avatare laufen über den eigenen Storage (`avatar_key`).
 */
export async function upsertUserFromClerk(data: {
  clerkId: string;
  email: string | null;
  imageUrl?: string | null;
}): Promise<User> {
  const [row] = await getDb()
    .insert(users)
    .values({ clerkId: data.clerkId, email: data.email })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: { email: sql`coalesce(excluded.email, ${users.email})`, updatedAt: new Date() },
    })
    .returning();
  return row;
}

/** Entfernt den Nutzer (Clerk `user.deleted`). Abhängige Daten folgen den FK-Regeln des Schemas. */
export async function deleteUserByClerkId(clerkId: string): Promise<void> {
  await getDb().delete(users).where(eq(users.clerkId, clerkId));
}

// ─── Viewer ───────────────────────────────────────────────────────────────────

/** Baut den Viewer zur Clerk-ID aus der DB (ohne Clerk-Aufruf). `null`, wenn der Nutzer unbekannt ist. */
export async function findViewerByClerkId(clerkId: string, opts: { now?: Date } = {}): Promise<Viewer | null> {
  const now = opts.now ?? new Date();
  const db = getDb();

  const [row] = await db
    .select({ user: users, profile: creatorProfiles })
    .from(users)
    .leftJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!row) return null;
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
      .max(40, "Dein Name darf höchstens 40 Zeichen lang sein."),
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

  try {
    await db
      .update(users)
      .set({ handle, displayName, birthDate, ageConfirmedAt: now, onboardedAt: now, updatedAt: now })
      .where(eq(users.id, viewer.id));
  } catch (error) {
    // Zwei gleichzeitige Anmeldungen mit demselben Handle: der eindeutige Index entscheidet.
    if (isUniqueViolation(error)) throw new HandleTakenError();
    throw error;
  }
}

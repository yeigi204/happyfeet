import "server-only";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { ageInYears, isAdult } from "@/lib/domain/age";
import type { VerificationStatus, Viewer } from "@/lib/domain/types";
import { assertAdmin } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { creatorProfiles, users } from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { writeAudit } from "@/server/services/audit";

/** Ein Creator-Antrag in der Verifizierungs-Queue. */
export type VerificationItem = {
  userId: string;
  handle: string;
  displayName: string;
  email: string | null;
  /** `YYYY-MM-DD`; `null` nur bei unvollständigem Onboarding (dann ist keine Freigabe möglich). */
  birthDate: string | null;
  /** Volle Jahre am Stichtag (Europe/Zurich); `null` ohne gültiges Geburtsdatum. */
  age: number | null;
  bio: string;
  monthlyPriceRappen: number;
  /** Offene Anträge: letzte Einreichung (auch erneute Bewerbung nach Ablehnung); sonst Erstbewerbung. */
  appliedAt: Date;
  status: VerificationStatus;
  note: string | null;
  verifiedAt: Date | null;
};

type Opts = { now?: Date };

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const NOTE_MAX_LENGTH = 1000;
const NOT_FOUND = "Dieser Creator-Antrag existiert nicht.";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Zeitpunkt der (letzten) Bewerbung – auch die Queue-Kennzahl im Dashboard nutzt diese Definition. */


function safeAge(birthDate: string | null, now: Date): number | null {
  if (!birthDate) return null;
  try {
    return ageInYears(birthDate, now);
  } catch {
    return null;
  }
}

function clampLimit(value: number | undefined): number {
  const n = Math.trunc(value ?? DEFAULT_LIMIT);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_LIMIT) : DEFAULT_LIMIT;
}

function parseNote(note: unknown, required: boolean): string | null {
  const value = typeof note === "string" ? note.replaceAll("\u0000", "").trim() : "";
  if (required && value.length === 0) {
    throw new ValidationError("Bitte begründe die Ablehnung.", { note: ["Eine Notiz ist Pflicht."] });
  }
  if (value.length > NOTE_MAX_LENGTH) {
    throw new ValidationError("Die Notiz ist zu lang.", { note: [`Höchstens ${NOTE_MAX_LENGTH} Zeichen.`] });
  }
  return value.length > 0 ? value : null;
}

/**
 * Creator-Anträge nach Status (Standard: `pending`). Offene Anträge älteste zuerst (FIFO),
 * entschiedene zuletzt entschieden zuerst.
 */
export async function listVerificationQueue(
  admin: Viewer,
  input: { status?: VerificationStatus; limit?: number } = {},
  opts: Opts = {},
): Promise<VerificationItem[]> {
  assertAdmin(admin);
  const now = opts.now ?? new Date();
  const status: VerificationStatus =
    input.status === "approved" || input.status === "rejected" ? input.status : "pending";

  const rows = await getDb()
    .select({
      userId: users.id,
      handle: users.handle,
      displayName: users.displayName,
      email: users.email,
      birthDate: users.birthDate,
      bio: creatorProfiles.bio,
      monthlyPriceRappen: creatorProfiles.monthlyPriceRappen,
      appliedAt: creatorProfiles.appliedAt,
      status: creatorProfiles.verificationStatus,
      note: creatorProfiles.verificationNote,
      verifiedAt: creatorProfiles.verifiedAt,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    // Offene Anträge gelöschter Konten sind gegenstandslos (sie bleiben als Datensatz erhalten).
    .where(and(eq(creatorProfiles.verificationStatus, status), status === "pending" ? isNull(users.deletedAt) : undefined))
    .orderBy(
      ...(status === "pending"
        ? [asc(creatorProfiles.appliedAt), asc(users.id)]
        : [sql`${creatorProfiles.verifiedAt} desc nulls last`, desc(creatorProfiles.createdAt), asc(users.id)]),
    )
    .limit(clampLimit(input.limit));

  return rows.map((row) => ({
    userId: row.userId,
    handle: row.handle ?? "",
    displayName: row.displayName ?? row.handle ?? "",
    email: row.email,
    birthDate: row.birthDate,
    age: safeAge(row.birthDate, now),
    bio: row.bio,
    monthlyPriceRappen: row.monthlyPriceRappen,
    appliedAt: row.appliedAt,
    status: row.status,
    note: row.note,
    verifiedAt: row.verifiedAt,
  }));
}

async function decide(
  admin: Viewer,
  userId: string,
  decision: "approved" | "rejected",
  note: string | null,
  now: Date,
): Promise<void> {
  if (!UUID_PATTERN.test(userId)) throw new NotFoundError(NOT_FOUND);
  await getDb().transaction(async (tx) => {
    const [current] = await tx
      .select({ status: creatorProfiles.verificationStatus, birthDate: users.birthDate })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(creatorProfiles.userId, userId))
      .limit(1);
    if (!current) throw new NotFoundError(NOT_FOUND);
    if (current.status !== "pending") {
      throw new ConflictError(
        current.status === "approved" ? "Dieser Creator ist bereits freigeschaltet." : "Dieser Antrag wurde bereits abgelehnt.",
      );
    }
    if (decision === "approved" && !(current.birthDate && isAdult(current.birthDate, now))) {
      throw new ValidationError("Ohne bestätigte Volljährigkeit ist keine Freigabe möglich.");
    }

    // Bedingtes Update: bei zwei gleichzeitigen Entscheidungen gewinnt genau eine.
    const updated = await tx
      .update(creatorProfiles)
      .set({ verificationStatus: decision, verificationNote: note, verifiedAt: now, verifiedBy: admin.id, updatedAt: now })
      .where(and(eq(creatorProfiles.userId, userId), eq(creatorProfiles.verificationStatus, "pending")))
      .returning({ userId: creatorProfiles.userId });
    if (updated.length === 0) throw new ConflictError("Dieser Antrag wurde gerade schon entschieden.");

    await writeAudit(
      {
        actorId: admin.id,
        action: decision === "approved" ? "creator.approved" : "creator.rejected",
        targetType: "creator",
        targetId: userId,
        metadata: { note },
      },
      tx,
    );
  });
}

/** Schaltet einen offenen Creator-Antrag frei (Notiz optional). */
export async function approveCreator(admin: Viewer, userId: string, note?: string, opts: Opts = {}): Promise<void> {
  assertAdmin(admin);
  await decide(admin, userId, "approved", parseNote(note, false), opts.now ?? new Date());
}

/** Lehnt einen offenen Creator-Antrag ab – die Notiz (Begründung für den Creator) ist Pflicht. */
export async function rejectCreator(admin: Viewer, userId: string, note: string, opts: Opts = {}): Promise<void> {
  assertAdmin(admin);
  await decide(admin, userId, "rejected", parseNote(note, true), opts.now ?? new Date());
}

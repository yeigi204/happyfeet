import "server-only";

import { and, desc, eq, gte, inArray, isNotNull, lt, lte, max, min, ne, sql } from "drizzle-orm";

import { lastPayoutBoundary, nextPayoutDate, payoutScheduleFor } from "@/lib/domain/payouts";
import { planOf } from "@/lib/domain/plans";
import type { PayoutSchedule, Viewer } from "@/lib/domain/types";
import { assertAdmin, assertCreator } from "@/server/auth/guards";
import { getDb, type DbOrTx } from "@/server/db/client";
import { payments, payouts, users, type Payout } from "@/server/db/schema";
import { ConflictError, NotFoundError } from "@/server/errors";

import { writeAudit } from "./audit";
import { isCreatorPremiumAt, premiumCreatorIdsAt } from "./premium";

/**
 * Auszahlungen an Creator. Grundlage sind ausschliesslich erfolgreiche Fan-Zahlungen
 * (`creator_net_rappen`); der Rhythmus folgt dem aktuellen Plan (Premium wöchentlich, sonst monatlich).
 */

export type CreatorBalance = {
  /** Verdient, aber noch in keiner (nicht fehlgeschlagenen) Auszahlung enthalten. */
  availableRappen: number;
  scheduledRappen: number;
  paidRappen: number;
  schedule: PayoutSchedule;
  nextPayoutDate: Date;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYOUT_NOT_FOUND = "Diese Auszahlung wurde nicht gefunden.";
/** Serialisiert parallele Läufe (Cron + Admin-Klick), damit keine Periode doppelt entsteht. */
const PAYOUT_LOCK_KEY = "happyfeet:generate-payouts";

const sumRappen = (column: typeof payments.creatorNetRappen | typeof payouts.amountRappen) =>
  sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number);

const creatorEarnings = (creatorId: string) =>
  and(
    eq(payments.creatorId, creatorId),
    eq(payments.kind, "fan_subscription"),
    eq(payments.status, "succeeded"),
  );

async function earnedBetween(db: DbOrTx, creatorId: string, from: Date, to: Date): Promise<number> {
  const [row] = await db
    .select({ amount: sumRappen(payments.creatorNetRappen) })
    .from(payments)
    .where(and(creatorEarnings(creatorId), gte(payments.createdAt, from), lt(payments.createdAt, to)));
  return row?.amount ?? 0;
}

/**
 * Erzeugt fällige Auszahlungen (`scheduled`) für alle nicht gesperrten Creator mit Guthaben.
 * Periode: vom Ende der letzten nicht fehlgeschlagenen Auszahlung (sonst ab der ersten Zahlung)
 * bis zur letzten Plan-Grenze ≤ now. Dieselbe Periode wird nie doppelt ausgezahlt.
 * `actor = null` = System (z. B. Cron); sonst nur Admins.
 */
export async function generateDuePayouts(
  actor: Viewer | null,
  opts: { now?: Date } = {},
): Promise<{ created: number; totalRappen: number }> {
  if (actor !== null) assertAdmin(actor);
  const now = opts.now ?? new Date();

  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PAYOUT_LOCK_KEY}))`);

    const earners = await tx
      .select({ creatorId: payments.creatorId, firstAt: min(payments.createdAt) })
      .from(payments)
      .innerJoin(users, eq(users.id, payments.creatorId))
      .where(
        and(
          eq(payments.kind, "fan_subscription"),
          eq(payments.status, "succeeded"),
          isNotNull(payments.creatorId),
          // Gesperrte Creator werden zurückgestellt; ihr Guthaben bleibt für später erhalten.
          eq(users.status, "active"),
        ),
      )
      .groupBy(payments.creatorId);

    const creatorIds = earners.flatMap((e) => (e.creatorId ? [e.creatorId] : []));
    const premium = await premiumCreatorIdsAt(creatorIds, now, tx);
    const lastEnds =
      creatorIds.length === 0
        ? []
        : await tx
            .select({ creatorId: payouts.creatorId, lastEnd: max(payouts.periodEnd) })
            .from(payouts)
            .where(and(inArray(payouts.creatorId, creatorIds), ne(payouts.status, "failed")))
            .groupBy(payouts.creatorId);
    const lastEndByCreator = new Map(lastEnds.map((row) => [row.creatorId, row.lastEnd]));

    let created = 0;
    let totalRappen = 0;
    for (const { creatorId, firstAt } of earners) {
      if (!creatorId || !firstAt) continue;
      const schedule = payoutScheduleFor(planOf(premium.has(creatorId)));
      const periodEnd = lastPayoutBoundary(schedule, now);
      const periodStart = lastEndByCreator.get(creatorId) ?? firstAt;
      if (periodEnd.getTime() <= periodStart.getTime()) continue;

      const amountRappen = await earnedBetween(tx, creatorId, periodStart, periodEnd);
      if (amountRappen <= 0) continue;

      await tx.insert(payouts).values({
        creatorId,
        amountRappen,
        currency: "CHF",
        schedule,
        periodStart,
        periodEnd,
        status: "scheduled",
        createdAt: now,
      });
      created += 1;
      totalRappen += amountRappen;
    }

    if (actor !== null || created > 0) {
      await writeAudit(
        {
          actorId: actor?.id ?? null,
          action: "payouts.generated",
          targetType: "payout",
          metadata: { created, totalRappen, at: now.toISOString() },
        },
        tx,
      );
    }
    return { created, totalRappen };
  });
}

/** Markiert eine geplante Auszahlung als bezahlt (nur Admin). */
export async function markPayoutPaid(admin: Viewer, payoutId: string, opts: { now?: Date } = {}): Promise<void> {
  assertAdmin(admin);
  const now = opts.now ?? new Date();
  if (typeof payoutId !== "string" || !UUID_PATTERN.test(payoutId)) throw new NotFoundError(PAYOUT_NOT_FOUND);

  await getDb().transaction(async (tx) => {
    const [payout] = await tx.select().from(payouts).where(eq(payouts.id, payoutId)).limit(1).for("update");
    if (!payout) throw new NotFoundError(PAYOUT_NOT_FOUND);
    if (payout.status === "paid") throw new ConflictError("Diese Auszahlung ist bereits als bezahlt markiert.");
    if (payout.status !== "scheduled") {
      throw new ConflictError("Fehlgeschlagene Auszahlungen können nicht als bezahlt markiert werden.");
    }

    await tx.update(payouts).set({ status: "paid", paidAt: now, paidBy: admin.id }).where(eq(payouts.id, payout.id));
    await writeAudit(
      {
        actorId: admin.id,
        action: "payout.paid",
        targetType: "payout",
        targetId: payout.id,
        metadata: {
          creatorId: payout.creatorId,
          amountRappen: payout.amountRappen,
          periodStart: payout.periodStart.toISOString(),
          periodEnd: payout.periodEnd.toISOString(),
        },
      },
      tx,
    );
  });
}

/** Guthaben des Creators: verfügbar (noch nicht verplant), geplant, ausbezahlt; dazu Rhythmus und nächster Termin. */
export async function getCreatorBalance(viewer: Viewer, opts: { now?: Date } = {}): Promise<CreatorBalance> {
  assertCreator(viewer);
  const now = opts.now ?? new Date();
  const db = getDb();

  const schedule = payoutScheduleFor(planOf(await isCreatorPremiumAt(viewer.id, now, db)));
  const [earned] = await db
    .select({ amount: sumRappen(payments.creatorNetRappen) })
    .from(payments)
    .where(creatorEarnings(viewer.id));
  const byStatus = await db
    .select({ status: payouts.status, amount: sumRappen(payouts.amountRappen) })
    .from(payouts)
    .where(eq(payouts.creatorId, viewer.id))
    .groupBy(payouts.status);

  const total = (status: Payout["status"]) => byStatus.find((row) => row.status === status)?.amount ?? 0;
  const scheduledRappen = total("scheduled");
  const paidRappen = total("paid");
  return {
    availableRappen: (earned?.amount ?? 0) - scheduledRappen - paidRappen,
    scheduledRappen,
    paidRappen,
    schedule,
    nextPayoutDate: nextPayoutDate(schedule, now),
  };
}

/** Eigene Auszahlungen (Stand `now`), neueste Periode zuerst. */
export async function listCreatorPayouts(viewer: Viewer, opts: { now?: Date } = {}): Promise<Payout[]> {
  assertCreator(viewer);
  const now = opts.now ?? new Date();
  return getDb()
    .select()
    .from(payouts)
    .where(and(eq(payouts.creatorId, viewer.id), lte(payouts.createdAt, now)))
    .orderBy(desc(payouts.periodEnd), desc(payouts.createdAt));
}

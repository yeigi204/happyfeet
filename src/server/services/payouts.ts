import "server-only";

import { and, desc, eq, inArray, isNotNull, lte, max, min, ne, sql } from "drizzle-orm";

import { lastPayoutBoundary, nextPayoutDate, payoutScheduleFor } from "@/lib/domain/payouts";
import { planOf } from "@/lib/domain/plans";
import type { PayoutSchedule, Viewer } from "@/lib/domain/types";
import { assertAdmin, assertCreator } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
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

/** Summe der Creator-Anteile mit `created_at < boundary` (für eine gruppierte Zahlungs-Abfrage). */
const earnedBefore = (boundary: Date) =>
  sql<number>`coalesce(sum(${payments.creatorNetRappen}) filter (where ${payments.createdAt} < ${boundary.toISOString()}::timestamptz), 0)`.mapWith(
    Number,
  );

const creatorEarnings = (creatorId: string) =>
  and(
    eq(payments.creatorId, creatorId),
    eq(payments.kind, "fan_subscription"),
    eq(payments.status, "succeeded"),
  );

/**
 * Erzeugt fällige Auszahlungen (`scheduled`) für alle nicht gesperrten Creator mit Guthaben.
 * Periode: vom Ende der letzten nicht fehlgeschlagenen Auszahlung (sonst ab der ersten Zahlung)
 * bis zur letzten Plan-Grenze ≤ now; ist diese Grenze nicht später als der Periodenbeginn, entsteht nichts.
 * Betrag: alle Creator-Anteile vor der Grenze minus alle nicht fehlgeschlagenen Auszahlungen. So wird
 * nichts doppelt ausgezahlt, und weder verspätet gebuchte Zahlungen (`created_at` = Zahlungszeitpunkt,
 * also evtl. vor dem Ende der letzten Auszahlung) noch fehlgeschlagene Auszahlungen gehen verloren.
 * `actor = null` = System (z. B. Cron); sonst nur Admins.
 */
export async function generateDuePayouts(
  actor: Viewer | null,
  opts: { now?: Date } = {},
): Promise<{ created: number; totalRappen: number }> {
  if (actor !== null) assertAdmin(actor);
  const now = opts.now ?? new Date();
  const boundaries: Record<PayoutSchedule, Date> = {
    weekly: lastPayoutBoundary("weekly", now),
    monthly: lastPayoutBoundary("monthly", now),
  };

  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PAYOUT_LOCK_KEY}))`);

    const earners = await tx
      .select({
        creatorId: payments.creatorId,
        firstAt: min(payments.createdAt),
        earnedBeforeWeekly: earnedBefore(boundaries.weekly),
        earnedBeforeMonthly: earnedBefore(boundaries.monthly),
      })
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
    const previous =
      creatorIds.length === 0
        ? []
        : await tx
            .select({
              creatorId: payouts.creatorId,
              lastEnd: max(payouts.periodEnd),
              totalRappen: sumRappen(payouts.amountRappen),
            })
            .from(payouts)
            .where(and(inArray(payouts.creatorId, creatorIds), ne(payouts.status, "failed")))
            .groupBy(payouts.creatorId);
    const previousByCreator = new Map(previous.map((row) => [row.creatorId, row]));

    const due: (typeof payouts.$inferInsert & { amountRappen: number })[] = [];
    for (const { creatorId, firstAt, earnedBeforeWeekly, earnedBeforeMonthly } of earners) {
      if (!creatorId || !firstAt) continue;
      const schedule = payoutScheduleFor(planOf(premium.has(creatorId)));
      const periodEnd = boundaries[schedule];
      const prev = previousByCreator.get(creatorId);
      const periodStart = prev?.lastEnd ?? firstAt;
      if (periodEnd.getTime() <= periodStart.getTime()) continue;

      const earned = schedule === "weekly" ? earnedBeforeWeekly : earnedBeforeMonthly;
      const amountRappen = earned - (prev?.totalRappen ?? 0);
      if (amountRappen <= 0) continue;

      due.push({
        creatorId,
        amountRappen,
        currency: "CHF",
        schedule,
        periodStart,
        periodEnd,
        status: "scheduled",
        createdAt: now,
      });
    }
    if (due.length > 0) await tx.insert(payouts).values(due);

    const created = due.length;
    const totalRappen = due.reduce((sum, payout) => sum + payout.amountRappen, 0);
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

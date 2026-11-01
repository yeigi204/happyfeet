import "server-only";

import { count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { PayoutSchedule, Viewer } from "@/lib/domain/types";
import { assertAdmin } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { payouts, users, type Payout } from "@/server/db/schema";
import { ValidationError, zodFieldErrors } from "@/server/errors";
import { generateDuePayouts as generateDuePayoutsAs } from "@/server/services/payouts";
import { premiumCreatorIdsAt } from "@/server/services/premium";

export { markPayoutPaid } from "@/server/services/payouts";

/**
 * Fällige Auszahlungen erzeugen – Admin-Variante von `generateDuePayouts` aus dem Payout-Service.
 * Anders als dort gibt es hier keinen System-Akteur: `null` (z. B. ein nicht angemeldeter Viewer
 * in einer Server Action) wird abgewiesen statt als System ausgeführt. Cron/Skripte nutzen
 * `@/server/services/payouts` direkt.
 */
export async function generateDuePayouts(
  admin: Viewer,
  opts: { now?: Date } = {},
): Promise<{ created: number; totalRappen: number }> {
  assertAdmin(admin);
  return generateDuePayoutsAs(admin, opts);
}

export type AdminPayoutRow = {
  id: string;
  creator: { userId: string; handle: string | null; displayName: string | null; isPremium: boolean };
  amountRappen: number;
  schedule: PayoutSchedule;
  periodStart: Date;
  periodEnd: Date;
  status: Payout["status"];
  createdAt: Date;
  paidAt: Date | null;
};

const listInputSchema = z
  .object({ status: z.enum(["scheduled", "paid", "failed"]).optional() })
  .optional();

type PayoutStatus = "scheduled" | "paid" | "failed";

const PAGE_DEFAULT_LIMIT = 50;
const PAGE_MAX_LIMIT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseStatus(input: { status?: PayoutStatus } | undefined): PayoutStatus | undefined {
  const parsed = listInputSchema.safeParse(input === undefined ? undefined : { status: input.status });
  if (!parsed.success) {
    throw new ValidationError("Ungültiger Filter.", zodFieldErrors(parsed.error.issues));
  }
  return parsed.data?.status;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const n = Math.trunc(value ?? fallback);
  return Number.isFinite(n) && n >= min ? Math.min(n, max) : fallback;
}

/**
 * Alle Auszahlungen (optional nach Status), neueste Periode zuerst – nur Admin. Ohne Limit; für die
 * Liste `listPayoutsPage` (Seiten + Gesamtzahl) und für Kopfzahlen `getPayoutSummary` verwenden.
 */
export async function listPayouts(
  admin: Viewer,
  input?: { status?: PayoutStatus },
  opts: { now?: Date } = {},
): Promise<AdminPayoutRow[]> {
  assertAdmin(admin);
  return queryPayouts(parseStatus(input), null, opts.now ?? new Date());
}

/**
 * Eine Seite Auszahlungen (optional nach Status), neueste Periode zuerst, plus Gesamtzahl für die
 * Paginierung. `limit` 1–200 (Standard 50), `offset` ≥ 0 – nur Admin.
 */
export async function listPayoutsPage(
  admin: Viewer,
  input: { status?: PayoutStatus; limit?: number; offset?: number } = {},
  opts: { now?: Date } = {},
): Promise<{ items: AdminPayoutRow[]; total: number; limit: number; offset: number }> {
  assertAdmin(admin);
  const status = parseStatus(input);
  const limit = clampInt(input.limit, PAGE_DEFAULT_LIMIT, 1, PAGE_MAX_LIMIT);
  const offset = clampInt(input.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const [{ total }] = await getDb()
    .select({ total: count() })
    .from(payouts)
    .where(status ? eq(payouts.status, status) : undefined);
  const items = await queryPayouts(status, { limit, offset }, opts.now ?? new Date());
  return { items, total: Number(total), limit, offset };
}

export type AdminPayoutSummary = {
  scheduled: { count: number; totalRappen: number; creators: number };
  paid: {
    count: number;
    totalRappen: number;
    /** frühester Periodenbeginn einer bezahlten Auszahlung */
    since: Date | null;
    last30d: { count: number; totalRappen: number };
  };
  failed: { count: number; totalRappen: number };
};

/** Kennzahlen über alle Auszahlungen (Kopfzeile und Tab-Zähler der Auszahlungsseite) – nur Admin. */
export async function getPayoutSummary(admin: Viewer, opts: { now?: Date } = {}): Promise<AdminPayoutSummary> {
  assertAdmin(admin);
  const now = opts.now ?? new Date();
  const since30d = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const sumWhere = (condition: ReturnType<typeof sql>) =>
    sql<string>`coalesce(sum(${payouts.amountRappen}) filter (where ${condition}), 0)::bigint`;
  const countWhere = (condition: ReturnType<typeof sql>) => sql<number>`(count(*) filter (where ${condition}))::int`;
  const isScheduled = sql`${payouts.status} = 'scheduled'`;
  const isPaid = sql`${payouts.status} = 'paid'`;
  const isFailed = sql`${payouts.status} = 'failed'`;
  const paidRecently = sql`${payouts.status} = 'paid' and ${payouts.paidAt} > ${since30d}::timestamptz`;

  const [row] = await getDb()
    .select({
      scheduledCount: countWhere(isScheduled),
      scheduledTotal: sumWhere(isScheduled),
      scheduledCreators: sql<number>`(count(distinct ${payouts.creatorId}) filter (where ${isScheduled}))::int`,
      paidCount: countWhere(isPaid),
      paidTotal: sumWhere(isPaid),
      paidSince: sql<Date | string | null>`min(${payouts.periodStart}) filter (where ${isPaid})`,
      paid30Count: countWhere(paidRecently),
      paid30Total: sumWhere(paidRecently),
      failedCount: countWhere(isFailed),
      failedTotal: sumWhere(isFailed),
    })
    .from(payouts);

  const paidSince = row?.paidSince ? new Date(row.paidSince) : null;
  return {
    scheduled: {
      count: Number(row?.scheduledCount ?? 0),
      totalRappen: Number(row?.scheduledTotal ?? 0),
      creators: Number(row?.scheduledCreators ?? 0),
    },
    paid: {
      count: Number(row?.paidCount ?? 0),
      totalRappen: Number(row?.paidTotal ?? 0),
      since: paidSince,
      last30d: { count: Number(row?.paid30Count ?? 0), totalRappen: Number(row?.paid30Total ?? 0) },
    },
    failed: { count: Number(row?.failedCount ?? 0), totalRappen: Number(row?.failedTotal ?? 0) },
  };
}

async function queryPayouts(
  status: PayoutStatus | undefined,
  page: { limit: number; offset: number } | null,
  now: Date,
): Promise<AdminPayoutRow[]> {
  const db = getDb();
  const query = db
    .select({ payout: payouts, handle: users.handle, displayName: users.displayName })
    .from(payouts)
    .innerJoin(users, eq(users.id, payouts.creatorId))
    .where(status ? eq(payouts.status, status) : undefined)
    .orderBy(desc(payouts.periodEnd), desc(payouts.createdAt), desc(payouts.id));
  const rows = page ? await query.limit(page.limit).offset(page.offset) : await query;

  const premium = await premiumCreatorIdsAt(
    rows.map((row) => row.payout.creatorId),
    now,
    db,
  );

  return rows.map(({ payout, handle, displayName }) => ({
    id: payout.id,
    creator: { userId: payout.creatorId, handle, displayName, isPremium: premium.has(payout.creatorId) },
    amountRappen: payout.amountRappen,
    schedule: payout.schedule,
    periodStart: payout.periodStart,
    periodEnd: payout.periodEnd,
    status: payout.status,
    createdAt: payout.createdAt,
    paidAt: payout.paidAt,
  }));
}

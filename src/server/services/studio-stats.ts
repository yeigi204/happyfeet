import "server-only";

import { and, count, eq, gt, gte, inArray, isNotNull, isNull, lt, min, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { PLAN_FEATURES, planOf } from "@/lib/domain/plans";
import type { CreatorPlan, Viewer } from "@/lib/domain/types";
import { assertCreator } from "@/server/auth/guards";
import { getDb, type Db } from "@/server/db/client";
import { payments, posts, subscriptions } from "@/server/db/schema";

import { getCreatorBalance } from "./payouts";
import { isCreatorPremiumAt } from "./premium";

/**
 * Statistik fürs Creator-Studio. Basis für alle Creator; die erweiterte Statistik
 * (MRR, Churn, 90-Tage-Reihe) nur mit Premium. Tage sind UTC-Kalendertage (YYYY-MM-DD).
 */

export type StudioDailyPoint = { date: string; netRappen: number; newSubs: number; canceledSubs: number };

export type StudioStats = {
  plan: CreatorPlan;
  basic: {
    activeSubscribers: number;
    netThisMonthRappen: number;
    grossThisMonthRappen: number;
    /** Freigegebene, nicht gelöschte Posts. */
    postCount: number;
    /** Posts in der Vorab-Prüfung. */
    pendingPostCount: number;
    balance: Awaited<ReturnType<typeof getCreatorBalance>>;
  };
  advanced: null | {
    /** Summe der Preise aktiver, nicht gekündigter Abos. */
    mrrRappen: number;
    /** Kündigungen der letzten 30 Tage ÷ (diese Kündigungen + weiterlaufende Abos); 0–1. */
    churnRate30d: number;
    /** 90 Tage bis heute, aufsteigend, lückenlos. */
    daily: StudioDailyPoint[];
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_DAYS = 90;
const CHURN_WINDOW_DAYS = 30;

const sumOf = (column: PgColumn) => sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number);
const utcDayOf = (column: PgColumn): SQL<string> => sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD')`;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const startOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const fanEarnings = (creatorId: string) =>
  and(eq(payments.creatorId, creatorId), eq(payments.kind, "fan_subscription"), eq(payments.status, "succeeded"));

export async function getStudioStats(viewer: Viewer, opts: { now?: Date } = {}): Promise<StudioStats> {
  assertCreator(viewer);
  const now = opts.now ?? new Date();
  const db = getDb();
  const creatorId = viewer.id;

  const plan = planOf(await isCreatorPremiumAt(creatorId, now, db));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [subscribers] = await db
    .select({ n: count() })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.creatorId, creatorId),
        inArray(subscriptions.status, ["active", "canceled"]),
        gt(subscriptions.currentPeriodEnd, now),
      ),
    );
  const [month] = await db
    .select({ gross: sumOf(payments.grossRappen), net: sumOf(payments.creatorNetRappen) })
    .from(payments)
    .where(and(fanEarnings(creatorId), gte(payments.createdAt, monthStart), lt(payments.createdAt, nextMonthStart)));
  const postCounts = await db
    .select({ status: posts.moderationStatus, n: count() })
    .from(posts)
    .where(and(eq(posts.creatorId, creatorId), isNull(posts.deletedAt)))
    .groupBy(posts.moderationStatus);
  const postsWith = (status: string) => postCounts.find((row) => row.status === status)?.n ?? 0;

  const basic: StudioStats["basic"] = {
    activeSubscribers: subscribers?.n ?? 0,
    netThisMonthRappen: month?.net ?? 0,
    grossThisMonthRappen: month?.gross ?? 0,
    postCount: postsWith("approved"),
    pendingPostCount: postsWith("pending"),
    balance: await getCreatorBalance(viewer, { now }),
  };

  if (!PLAN_FEATURES[plan].advancedStats) return { plan, basic, advanced: null };
  return { plan, basic, advanced: await advancedStats(db, creatorId, now) };
}

async function advancedStats(db: Db, creatorId: string, now: Date): Promise<NonNullable<StudioStats["advanced"]>> {
  const continuing = and(
    eq(subscriptions.creatorId, creatorId),
    eq(subscriptions.status, "active"),
    eq(subscriptions.cancelAtPeriodEnd, false),
    gt(subscriptions.currentPeriodEnd, now),
  );
  const [mrr] = await db
    .select({ amount: sumOf(subscriptions.priceRappen), n: count() })
    .from(subscriptions)
    .where(continuing);
  const [churned] = await db
    .select({ n: count() })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.creatorId, creatorId),
        gte(subscriptions.canceledAt, new Date(now.getTime() - CHURN_WINDOW_DAYS * DAY_MS)),
        lt(subscriptions.canceledAt, now),
      ),
    );
  const canceled30 = churned?.n ?? 0;
  const base = canceled30 + (mrr?.n ?? 0);

  const from = new Date(startOfUtcDay(now).getTime() - (DAILY_DAYS - 1) * DAY_MS);
  const to = new Date(startOfUtcDay(now).getTime() + DAY_MS);

  const netDay = utcDayOf(payments.createdAt);
  const netRows = await db
    .select({ day: netDay, amount: sumOf(payments.creatorNetRappen) })
    .from(payments)
    .where(and(fanEarnings(creatorId), gte(payments.createdAt, from), lt(payments.createdAt, to)))
    .groupBy(netDay);

  const canceledDay = utcDayOf(subscriptions.canceledAt);
  const canceledRows = await db
    .select({ day: canceledDay, n: count() })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.creatorId, creatorId),
        gte(subscriptions.canceledAt, from),
        lt(subscriptions.canceledAt, to),
      ),
    )
    .groupBy(canceledDay);

  // Neues Abo = erste Zahlung eines Abos (eine erneute Anmeldung nach Ablauf ist ein neues Abo).
  const firstPayments = await db
    .select({ firstAt: min(payments.createdAt) })
    .from(payments)
    .where(
      and(
        eq(payments.creatorId, creatorId),
        eq(payments.kind, "fan_subscription"),
        isNotNull(payments.subscriptionId),
      ),
    )
    .groupBy(payments.subscriptionId)
    .having(
      sql`min(${payments.createdAt}) >= ${from.toISOString()}::timestamptz and min(${payments.createdAt}) < ${to.toISOString()}::timestamptz`,
    );

  const netByDay = new Map(netRows.map((row) => [row.day, row.amount]));
  const canceledByDay = new Map(canceledRows.map((row) => [row.day, row.n]));
  const newByDay = new Map<string, number>();
  for (const { firstAt } of firstPayments) {
    if (!firstAt) continue;
    const day = isoDay(firstAt);
    newByDay.set(day, (newByDay.get(day) ?? 0) + 1);
  }

  const daily: StudioDailyPoint[] = Array.from({ length: DAILY_DAYS }, (_, i) => {
    const date = isoDay(new Date(from.getTime() + i * DAY_MS));
    return {
      date,
      netRappen: netByDay.get(date) ?? 0,
      newSubs: newByDay.get(date) ?? 0,
      canceledSubs: canceledByDay.get(date) ?? 0,
    };
  });

  return {
    mrrRappen: mrr?.amount ?? 0,
    churnRate30d: base === 0 ? 0 : canceled30 / base,
    daily,
  };
}

import "server-only";

import { and, eq, gt, inArray, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { feeBpsForPlan, splitPayment } from "@/lib/domain/fees";
import { planOf } from "@/lib/domain/plans";
import { REPORT_REASONS } from "@/lib/domain/reports";
import type { ReportReason, Viewer } from "@/lib/domain/types";
import { assertAdmin } from "@/server/auth/guards";
import { getDb, type Db } from "@/server/db/client";
import {
  creatorProfiles,
  payments,
  payouts,
  posts,
  premiumSubscriptions,
  reports,
  subscriptions,
  users,
} from "@/server/db/schema";
import { getPlatformSettings } from "@/server/services/settings";

import { listAuditLog, type AuditFeedItem } from "./audit";

/**
 * Kennzahlen fürs Admin-Dashboard. Alle Beträge in Rappen, alle `…Pct` in Prozentpunkten
 * (12.5 = 12.5 %, eine Nachkommastelle), Tagesreihen = UTC-Kalendertage.
 */
export type AdminDashboard = {
  kpis: {
    /** Summe `price_rappen` aktiver, nicht kündigender Fan-Abos. */
    mrrRappen: number;
    /** MRR jetzt vs. vor 30 Tagen (rekonstruiert aus den Abo-Perioden); `null`, wenn damals 0. */
    mrrDeltaPct: number | null;
    /** Erwartete Provision auf die MRR (aktueller Plan & Satz) + aktive, nicht kündigende Premium-Pläne. */
    platformMrrRappen: number;
    /** Plattform-Umsatz (Provisionen + Premium-Pläne) der letzten 30 Tage. */
    platformRevenue30dRappen: number;
    /** vs. die 30 Tage davor; `null`, wenn damals 0. */
    platformRevenueDeltaPct: number | null;
    /** Bruttovolumen aller Zahlungen der letzten 30 Tage. */
    grossVolume30dRappen: number;
    /** Fan-Abos mit laufendem Zugriff (inkl. gekündigter bis Periodenende). */
    activeSubscriptions: number;
    /** jetzt minus vor 30 Tagen */
    activeSubscriptionsDelta30d: number;
    /** freigegeben & nicht gesperrt */
    creatorsApproved: number;
    /** offene Anträge (= Verifizierungs-Queue) */
    creatorsPending: number;
    /** freigegeben, nicht gesperrt und gerade Premium */
    creatorsPremium: number;
    /** onboardete, aktive Nutzer ohne Creator-Profil und ohne Admin-Recht */
    fans: number;
    /** Anteil Premium an den freigegebenen Creators (0 ohne Creators) */
    premiumSharePct: number;
  };
  /** 90 Tage, lückenlos, aufsteigend, letzter Eintrag = heute (UTC). */
  revenueDaily: { date: string; platformFeeRappen: number; creatorNetRappen: number }[];
  /** 90 Tage; `active` = Abos mit Zugriff am Tagesende (heute: jetzt). */
  subscriptionsDaily: { date: string; newSubs: number; canceledSubs: number; active: number }[];
  /** Plattform-Umsatz der letzten 30 Tage nach Quelle. */
  feeMix30d: { standardFeesRappen: number; premiumFeesRappen: number; premiumPlansRappen: number };
  queues: {
    verifications: { count: number; oldestAt: Date | null };
    premoderation: { count: number; oldestAt: Date | null };
    reports: { count: number; criticalCount: number; oldestAt: Date | null };
    payoutsScheduled: { count: number; totalRappen: number };
  };
  /** max. 8, nach Brutto 30 Tage, dann aktiven Abonnenten */
  topCreators: {
    userId: string;
    handle: string;
    displayName: string;
    isPremium: boolean;
    activeSubscribers: number;
    gross30dRappen: number;
    net30dRappen: number;
  }[];
  /** die neuesten 12 Audit-Einträge */
  activity: AuditFeedItem[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const SERIES_DAYS = 90;
const WINDOW_DAYS = 30;
const TOP_CREATORS = 8;
const ACTIVITY_ITEMS = 12;

const CRITICAL_REASONS = (Object.keys(REPORT_REASONS) as ReportReason[]).filter(
  (reason) => REPORT_REASONS[reason].severity === "critical",
);

const num = (value: unknown): number => Number(value ?? 0);

/** Timestamps aus Roh-SQL: je nach Treiber `Date` oder String. */
function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(String(value));
}

function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function ts(d: Date) {
  return sql`${d.toISOString()}::timestamptz`;
}

/**
 * Fan-Abos als zusammenhängende Zugriffsspannen: Beginn = erste Zahlung (sonst `created_at`),
 * Ende = `current_period_end`, Kündigung = `canceled_at`. Ein erneutes Abo ist eine neue Zeile.
 */
const SPANS_CTE = sql`spans as (
  select s.price_rappen, s.status, s.cancel_at_period_end, s.canceled_at, s.current_period_end,
         coalesce(fp.first_paid, s.created_at) as started_at
  from ${subscriptions} s
  left join (
    select subscription_id, min(created_at) as first_paid
    from ${payments}
    where kind = 'fan_subscription' and subscription_id is not null
    group by subscription_id
  ) fp on fp.subscription_id = s.id
  where s.status <> 'pending' and s.current_period_end is not null
)`;

function premiumNow(creatorId: AnyPgColumn, now: Date) {
  return sql<boolean>`exists (select 1 from ${premiumSubscriptions} where ${and(
    eq(premiumSubscriptions.creatorId, creatorId),
    inArray(premiumSubscriptions.status, ["active", "canceled"]),
    gt(premiumSubscriptions.currentPeriodEnd, now),
  )})`;
}

/** Admin-Dashboard: wenige aggregierende SQL-Abfragen (keine N+1), parallel ausgeführt. */
export async function getAdminDashboard(admin: Viewer, opts: { now?: Date } = {}): Promise<AdminDashboard> {
  assertAdmin(admin);
  const now = opts.now ?? new Date();
  const db = getDb();

  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const seriesStartMs = todayMs - (SERIES_DAYS - 1) * DAY_MS;
  const seriesStart = new Date(seriesStartMs);
  const t30 = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
  const t60 = new Date(now.getTime() - 2 * WINDOW_DAYS * DAY_MS);
  const dates = Array.from({ length: SERIES_DAYS }, (_, i) => isoDay(seriesStartMs + i * DAY_MS));
  const criticalList = sql.join(
    CRITICAL_REASONS.map((r) => sql`${r}`),
    sql`, `,
  );

  const [
    settings,
    revenueRows,
    paymentKpis,
    subscriptionSeries,
    subscriptionKpis,
    mrrGroups,
    premiumPlanMrr,
    creatorKpis,
    queueRow,
    topRows,
    activity,
  ] = await Promise.all([
    getPlatformSettings(db),

    // Umsatz pro UTC-Tag
    query<{ day: string; platform_fee: unknown; creator_net: unknown }>(db, sql`
      select to_char((created_at at time zone 'UTC')::date, 'YYYY-MM-DD') as day,
             sum(platform_fee_rappen)::bigint as platform_fee,
             sum(creator_net_rappen)::bigint as creator_net
      from ${payments}
      where status = 'succeeded' and created_at >= ${ts(seriesStart)} and created_at <= ${ts(now)}
      group by 1`),

    // Zahlungs-Kennzahlen 30 Tage / Vorperiode / Provisions-Mix
    query(db, sql`
      select
        coalesce(sum(platform_fee_rappen) filter (where created_at > ${ts(t30)}), 0)::bigint as revenue_30d,
        coalesce(sum(platform_fee_rappen) filter (where created_at <= ${ts(t30)}), 0)::bigint as revenue_prev,
        coalesce(sum(gross_rappen) filter (where created_at > ${ts(t30)}), 0)::bigint as gross_30d,
        coalesce(sum(platform_fee_rappen) filter (where created_at > ${ts(t30)} and kind = 'fan_subscription'
          and coalesce(creator_plan, 'standard') = 'standard'), 0)::bigint as standard_fees,
        coalesce(sum(platform_fee_rappen) filter (where created_at > ${ts(t30)} and kind = 'fan_subscription'
          and creator_plan = 'premium'), 0)::bigint as premium_fees,
        coalesce(sum(platform_fee_rappen) filter (where created_at > ${ts(t30)} and kind = 'premium_plan'), 0)::bigint
          as premium_plans
      from ${payments}
      where status = 'succeeded' and created_at > ${ts(t60)} and created_at <= ${ts(now)}`),

    // Abo-Reihe: neu / gekündigt / aktiv je UTC-Tag
    query<{ day: string; new_subs: unknown; canceled_subs: unknown; active: unknown }>(db, sql`
      with ${SPANS_CTE},
      days as (
        select d::date as day,
               (d::date)::timestamp at time zone 'UTC' as day_start,
               ((d::date) + 1)::timestamp at time zone 'UTC' as day_next
        from generate_series(${isoDay(seriesStartMs)}::date, ${isoDay(todayMs)}::date, interval '1 day') as d
      ),
      bounds as (
        -- Stichtag für "aktiv": Tagesende, heute aber jetzt
        select day, day_start, day_next, least(day_next, ${ts(now)}) as instant from days
      )
      select to_char(b.day, 'YYYY-MM-DD') as day,
        (select count(*)::int from spans
          where started_at >= b.day_start and started_at < b.day_next and started_at <= ${ts(now)}) as new_subs,
        (select count(*)::int from spans
          where canceled_at >= b.day_start and canceled_at < b.day_next and canceled_at <= ${ts(now)}) as canceled_subs,
        (select count(*)::int from spans
          where started_at < b.day_next and started_at <= b.instant and current_period_end > b.instant) as active
      from bounds b
      order by b.day`),

    // MRR jetzt / vor 30 Tagen, aktive Abos jetzt / vor 30 Tagen
    query(db, sql`
      with ${SPANS_CTE}
      select
        coalesce(sum(price_rappen) filter (where status = 'active' and not cancel_at_period_end
          and current_period_end > ${ts(now)}), 0)::bigint as mrr_now,
        coalesce(sum(price_rappen) filter (where started_at <= ${ts(t30)} and current_period_end > ${ts(t30)}
          and (canceled_at is null or canceled_at > ${ts(t30)})), 0)::bigint as mrr_30d_ago,
        count(*) filter (where status in ('active', 'canceled') and current_period_end > ${ts(now)})::int as active_now,
        count(*) filter (where started_at <= ${ts(t30)} and current_period_end > ${ts(t30)})::int as active_30d_ago
      from spans`),

    // Erwartete Provision der MRR: gruppiert nach Preis und aktuellem Plan des Creators
    db
      .select({
        priceRappen: subscriptions.priceRappen,
        isPremium: premiumNow(subscriptions.creatorId, now),
        count: sql<number>`count(*)::int`,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, "active"),
          eq(subscriptions.cancelAtPeriodEnd, false),
          gt(subscriptions.currentPeriodEnd, now),
        ),
      )
      // Ordinal 2 = isPremium: derselbe Ausdruck mit eigenen Parametern würde Postgres nicht als gleich erkennen.
      .groupBy(subscriptions.priceRappen, sql`2`),

    db
      .select({ total: sql<number>`coalesce(sum(${premiumSubscriptions.priceRappen}), 0)::bigint`.mapWith(Number) })
      .from(premiumSubscriptions)
      .where(
        and(
          eq(premiumSubscriptions.status, "active"),
          eq(premiumSubscriptions.cancelAtPeriodEnd, false),
          gt(premiumSubscriptions.currentPeriodEnd, now),
        ),
      ),

    // Creator & Fans
    db
      .select({
        approved: sql<number>`count(*) filter (where ${creatorProfiles.verificationStatus} = 'approved'
          and ${users.status} = 'active')::int`,
        pending: sql<number>`count(*) filter (where ${creatorProfiles.verificationStatus} = 'pending')::int`,
        premium: sql<number>`count(*) filter (where ${creatorProfiles.verificationStatus} = 'approved'
          and ${users.status} = 'active' and ${premiumNow(users.id, now)})::int`,
        fans: sql<number>`(select count(*)::int from ${users} as f
          where f.onboarded_at is not null and f.status = 'active' and not f.is_admin
          and not exists (select 1 from ${creatorProfiles} as fp where fp.user_id = f.id))`,
      })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId)),

    // Warteschlangen
    query(db, sql`
      select
        (select count(*)::int from ${creatorProfiles} where verification_status = 'pending') as verifications,
        (select min(updated_at) from ${creatorProfiles} where verification_status = 'pending') as verifications_oldest,
        (select count(*)::int from ${posts} where moderation_status = 'pending' and deleted_at is null) as premoderation,
        (select min(created_at) from ${posts} where moderation_status = 'pending' and deleted_at is null)
          as premoderation_oldest,
        (select count(*)::int from ${reports} where status = 'open') as reports,
        (select count(*)::int from ${reports} where status = 'open' and reason in (${criticalList})) as reports_critical,
        (select min(created_at) from ${reports} where status = 'open') as reports_oldest,
        (select count(*)::int from ${payouts} where status = 'scheduled') as payouts,
        (select coalesce(sum(amount_rappen), 0)::bigint from ${payouts} where status = 'scheduled') as payouts_total`),

    // Top-Creator (30 Tage)
    query(db, sql`
      select ${users.id} as user_id, ${users.handle} as handle, ${users.displayName} as display_name,
             ${premiumNow(users.id, now)} as is_premium,
             coalesce(live.subscribers, 0)::int as active_subscribers,
             coalesce(paid.gross, 0)::bigint as gross_30d,
             coalesce(paid.net, 0)::bigint as net_30d
      from ${creatorProfiles}
      join ${users} on ${users.id} = ${creatorProfiles.userId}
      left join (
        select creator_id, count(*) as subscribers from ${subscriptions}
        where status in ('active', 'canceled') and current_period_end > ${ts(now)}
        group by creator_id
      ) live on live.creator_id = ${users.id}
      left join (
        select creator_id, sum(gross_rappen) as gross, sum(creator_net_rappen) as net from ${payments}
        where kind = 'fan_subscription' and status = 'succeeded'
          and created_at > ${ts(t30)} and created_at <= ${ts(now)}
        group by creator_id
      ) paid on paid.creator_id = ${users.id}
      where ${creatorProfiles.verificationStatus} = 'approved' and ${users.status} = 'active'
      order by gross_30d desc, active_subscribers desc, ${users.createdAt} asc, ${users.id} asc
      limit ${TOP_CREATORS}`),

    listAuditLog(admin, { limit: ACTIVITY_ITEMS }),
  ]);

  // ── Umsatzreihe ──
  const revenueByDay = new Map(
    revenueRows.map((r) => [r.day, { platform: num(r.platform_fee), net: num(r.creator_net) }]),
  );
  const revenueDaily = dates.map((date) => ({
    date,
    platformFeeRappen: revenueByDay.get(date)?.platform ?? 0,
    creatorNetRappen: revenueByDay.get(date)?.net ?? 0,
  }));

  // ── Abo-Reihe ──
  const subsByDay = new Map(subscriptionSeries.map((r) => [r.day, r]));
  const subscriptionsDaily = dates.map((date) => {
    const row = subsByDay.get(date);
    return {
      date,
      newSubs: num(row?.new_subs),
      canceledSubs: num(row?.canceled_subs),
      active: num(row?.active),
    };
  });

  // ── KPIs ──
  const pay = paymentKpis[0] ?? {};
  const subs = subscriptionKpis[0] ?? {};
  const mrrRappen = num(subs.mrr_now);
  const fanFeeMrr = mrrGroups.reduce((sum, group) => {
    const feeBps = feeBpsForPlan(planOf(Boolean(group.isPremium)), settings);
    return sum + splitPayment(group.priceRappen, feeBps).platformFeeRappen * num(group.count);
  }, 0);
  const creators = creatorKpis[0] ?? { approved: 0, pending: 0, premium: 0, fans: 0 };
  const creatorsApproved = num(creators.approved);
  const creatorsPremium = num(creators.premium);
  const revenue30d = num(pay.revenue_30d);
  const activeNow = num(subs.active_now);

  const queue = queueRow[0] ?? {};

  return {
    kpis: {
      mrrRappen,
      mrrDeltaPct: deltaPct(mrrRappen, num(subs.mrr_30d_ago)),
      platformMrrRappen: fanFeeMrr + num(premiumPlanMrr[0]?.total),
      platformRevenue30dRappen: revenue30d,
      platformRevenueDeltaPct: deltaPct(revenue30d, num(pay.revenue_prev)),
      grossVolume30dRappen: num(pay.gross_30d),
      activeSubscriptions: activeNow,
      activeSubscriptionsDelta30d: activeNow - num(subs.active_30d_ago),
      creatorsApproved,
      creatorsPending: num(creators.pending),
      creatorsPremium,
      fans: num(creators.fans),
      premiumSharePct: creatorsApproved === 0 ? 0 : Math.round((creatorsPremium / creatorsApproved) * 1000) / 10,
    },
    revenueDaily,
    subscriptionsDaily,
    feeMix30d: {
      standardFeesRappen: num(pay.standard_fees),
      premiumFeesRappen: num(pay.premium_fees),
      premiumPlansRappen: num(pay.premium_plans),
    },
    queues: {
      verifications: { count: num(queue.verifications), oldestAt: toDate(queue.verifications_oldest) },
      premoderation: { count: num(queue.premoderation), oldestAt: toDate(queue.premoderation_oldest) },
      reports: {
        count: num(queue.reports),
        criticalCount: num(queue.reports_critical),
        oldestAt: toDate(queue.reports_oldest),
      },
      payoutsScheduled: { count: num(queue.payouts), totalRappen: num(queue.payouts_total) },
    },
    topCreators: topRows.map((row) => {
      const handle = typeof row.handle === "string" ? row.handle : "";
      return {
        userId: String(row.user_id),
        handle,
        displayName: typeof row.display_name === "string" ? row.display_name : handle,
        isPremium: row.is_premium === true || row.is_premium === "t",
        activeSubscribers: num(row.active_subscribers),
        gross30dRappen: num(row.gross_30d),
        net30dRappen: num(row.net_30d),
      };
    }),
    activity,
  };
}

type Row = Record<string, unknown>;

/** Roh-SQL ausführen; `db.execute` liefert je nach Treiber ein Array (postgres-js) oder `{ rows }` (PGlite). */
async function query<T extends Row = Row>(db: Db, statement: SQL): Promise<T[]> {
  const result: unknown = await db.execute(statement);
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

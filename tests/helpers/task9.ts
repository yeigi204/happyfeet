/**
 * Test-Helfer für Task 9 (Admin-Services).
 *
 * Schreiben direkt über Drizzle, damit Dashboard- und Moderationstests gezielte Zustände herstellen können:
 * - `insertFanSubscription(...)`: Fan-Abo samt einer Zahlung pro bezahlter Periode (Gebühren-Snapshot via `splitPayment`).
 * - `insertPremiumPlan(...)`: Premium-Plan eines Creators samt `premium_plan`-Zahlung (fee_bps 10000).
 * - `insertReport(...)`, `insertPayout(...)`, `insertAudit(...)`.
 */
import { randomUUID } from "node:crypto";

import { splitPayment } from "@/lib/domain/fees";
import type { CreatorPlan, ReportReason, SubscriptionStatus } from "@/lib/domain/types";
import type { Db } from "@/server/db/client";
import {
  auditLog,
  payments,
  payouts,
  premiumSubscriptions,
  reports,
  subscriptions,
  type Payout,
  type PremiumSubscription,
  type Report,
  type Subscription,
} from "@/server/db/schema";

export const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

export function daysAfter(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

const STANDARD_FEE_BPS = 1500;
const PREMIUM_FEE_BPS = 500;

/**
 * Fan-Abo mit einer Zahlung pro Eintrag in `payments` (Zeitpunkt + Plan des Creators zu diesem Zeitpunkt).
 * Der Gebührensatz folgt den Standard-Einstellungen (15 % / 5 %).
 */
export async function insertFanSubscription(
  db: Db,
  input: {
    fanId: string;
    creatorId: string;
    priceRappen: number;
    status: SubscriptionStatus;
    currentPeriodEnd: Date;
    payments: { at: Date; plan: CreatorPlan }[];
    cancelAtPeriodEnd?: boolean;
    canceledAt?: Date | null;
    createdAt?: Date;
  },
): Promise<Subscription> {
  const first = input.payments[0]?.at ?? input.createdAt ?? new Date();
  const last = input.payments[input.payments.length - 1]?.at ?? first;
  const [sub] = await db
    .insert(subscriptions)
    .values({
      fanId: input.fanId,
      creatorId: input.creatorId,
      status: input.status,
      priceRappen: input.priceRappen,
      currentPeriodStart: last,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      canceledAt: input.canceledAt ?? null,
      provider: "mock",
      providerRef: `mocksub_${randomUUID()}`,
      createdAt: input.createdAt ?? first,
    })
    .returning();

  for (const payment of input.payments) {
    const feeBps = payment.plan === "premium" ? PREMIUM_FEE_BPS : STANDARD_FEE_BPS;
    await db.insert(payments).values({
      kind: "fan_subscription",
      subscriptionId: sub.id,
      payerId: input.fanId,
      creatorId: input.creatorId,
      grossRappen: input.priceRappen,
      feeBps,
      ...splitPayment(input.priceRappen, feeBps),
      creatorPlan: payment.plan,
      provider: "mock",
      providerPaymentId: `mockpay_${randomUUID()}`,
      createdAt: payment.at,
    });
  }
  return sub;
}

/** Premium-Plan (Creator → Plattform) mit je einer `premium_plan`-Zahlung pro Eintrag in `paidAt`. */
export async function insertPremiumPlan(
  db: Db,
  input: {
    creatorId: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    paidAt: Date[];
    priceRappen?: number;
    status?: "active" | "canceled" | "expired";
    cancelAtPeriodEnd?: boolean;
  },
): Promise<PremiumSubscription> {
  const priceRappen = input.priceRappen ?? 1900;
  const [row] = await db
    .insert(premiumSubscriptions)
    .values({
      creatorId: input.creatorId,
      status: input.status ?? "active",
      priceRappen,
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      provider: "mock",
      providerRef: `mocksub_${randomUUID()}`,
    })
    .returning();
  for (const at of input.paidAt) {
    await db.insert(payments).values({
      kind: "premium_plan",
      premiumSubscriptionId: row.id,
      payerId: input.creatorId,
      creatorId: null,
      grossRappen: priceRappen,
      feeBps: 10_000,
      platformFeeRappen: priceRappen,
      creatorNetRappen: 0,
      creatorPlan: null,
      provider: "mock",
      providerPaymentId: `mockpay_${randomUUID()}`,
      createdAt: at,
    });
  }
  return row;
}

export async function insertReport(
  db: Db,
  input: {
    postId: string;
    reporterId: string | null;
    reason: ReportReason;
    createdAt?: Date;
    status?: "open" | "resolved" | "dismissed";
    details?: string;
  },
): Promise<Report> {
  const [row] = await db
    .insert(reports)
    .values({
      postId: input.postId,
      reporterId: input.reporterId,
      reason: input.reason,
      details: input.details ?? "",
      status: input.status ?? "open",
      createdAt: input.createdAt ?? new Date(),
    })
    .returning();
  return row;
}

export async function insertPayout(
  db: Db,
  input: {
    creatorId: string;
    amountRappen: number;
    status?: "scheduled" | "paid" | "failed";
    schedule?: "weekly" | "monthly";
    periodStart?: Date;
    periodEnd?: Date;
  },
): Promise<Payout> {
  const [row] = await db
    .insert(payouts)
    .values({
      creatorId: input.creatorId,
      amountRappen: input.amountRappen,
      schedule: input.schedule ?? "monthly",
      periodStart: input.periodStart ?? new Date("2026-10-01T00:00:00Z"),
      periodEnd: input.periodEnd ?? new Date("2026-11-01T00:00:00Z"),
      status: input.status ?? "scheduled",
    })
    .returning();
  return row;
}

export async function insertAudit(
  db: Db,
  input: { actorId: string | null; action: string; createdAt: Date; targetType?: string; targetId?: string },
): Promise<void> {
  await db.insert(auditLog).values({
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    metadata: {},
    createdAt: input.createdAt,
  });
}

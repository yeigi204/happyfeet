/**
 * Test-Helfer für Task 8 (Abos, Premium, Zahlungs-Events, Auszahlungen, Studio-Statistik).
 *
 * - `setupMockPayments(now)`: setzt `PAYMENT_WEBHOOK_SECRET`, aktiviert einen Mock-Provider mit
 *   verstellbarer Uhr und räumt danach wieder auf.
 * - `subscribeAndPay(...)`: kompletter Abo-Abschluss über die echten Services.
 * - Event-Bauer für Verlängerungen (`fanRenewalEvent`, `premiumRenewalEvent`).
 * - `insertFanPayment(...)`: schreibt eine Fan-Zahlung direkt ins Ledger (für Payout-/Statistik-Tests).
 */
import { randomUUID } from "node:crypto";

import { and, asc, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach } from "vitest";

import { splitPayment } from "@/lib/domain/fees";
import type { CreatorPlan, Viewer } from "@/lib/domain/types";
import type { Db } from "@/server/db/client";
import { payments, premiumSubscriptions, subscriptions, type Payment, type Subscription } from "@/server/db/schema";
import { MockPaymentProvider, setPaymentProviderForTesting, type PaymentEvent } from "@/server/payments";
import { completeMockCheckout } from "@/server/services/payment-events";
import { startPremiumCheckout } from "@/server/services/premium";
import { startSubscriptionCheckout } from "@/server/services/subscriptions";

export const TEST_WEBHOOK_SECRET = "happyfeet-test-webhook-secret-0123456789abcdef";

export type MockPayments = { clock: { now: Date }; provider: MockPaymentProvider };

/** Registriert Vitest-Hooks: Secret + Mock-Provider mit Uhr `clock.now` (vor jedem Test auf `initialNow`). */
export function setupMockPayments(initialNow: Date): MockPayments {
  const clock = { now: initialNow };
  const provider = new MockPaymentProvider({ now: () => clock.now });
  const saved: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of ["PAYMENT_WEBHOOK_SECRET", "PAYMENT_PROVIDER", "APP_URL"]) saved[key] = process.env[key];
    process.env.PAYMENT_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    delete process.env.PAYMENT_PROVIDER;
    delete process.env.APP_URL;
    setPaymentProviderForTesting(provider);
  });

  beforeEach(() => {
    clock.now = initialNow;
  });

  afterAll(() => {
    setPaymentProviderForTesting(null);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  return { clock, provider };
}

/** `/checkout/mock/<sessionId>` → `<sessionId>` */
export function sessionIdFrom(redirectUrl: string): string {
  const prefix = "/checkout/mock/";
  if (!redirectUrl.startsWith(prefix)) throw new Error(`Unerwartete Checkout-URL: ${redirectUrl}`);
  return redirectUrl.slice(prefix.length);
}

/** Checkout starten und sofort „bezahlen“. Liefert die (aktivierte) Abo-Zeile. */
export async function subscribeAndPay(db: Db, fan: Viewer, creatorId: string, now: Date): Promise<Subscription> {
  const { redirectUrl } = await startSubscriptionCheckout(fan, { creatorId }, { now });
  await completeMockCheckout(fan, sessionIdFrom(redirectUrl), { now });
  const [live] = await db
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.fanId, fan.id), eq(subscriptions.creatorId, creatorId), eq(subscriptions.status, "active")),
    );
  if (!live) throw new Error("subscribeAndPay: kein aktives Abo nach dem Checkout");
  return live;
}

/** Premium-Checkout starten und „bezahlen“. */
export async function buyPremium(creator: Viewer, now: Date): Promise<void> {
  const { redirectUrl } = await startPremiumCheckout(creator, { now });
  await completeMockCheckout(creator, sessionIdFrom(redirectUrl), { now });
}

export async function subscriptionById(db: Db, id: string): Promise<Subscription> {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
  if (!row) throw new Error(`Abo ${id} nicht gefunden`);
  return row;
}

export async function paymentsForSubscription(db: Db, subscriptionId: string): Promise<Payment[]> {
  return db
    .select()
    .from(payments)
    .where(eq(payments.subscriptionId, subscriptionId))
    .orderBy(asc(payments.createdAt));
}

/** Verlängerung eines Fan-Abos; Periode = Anzahl bisheriger Zahlungen (erste Verlängerung = 1). */
export async function fanRenewalEvent(
  db: Db,
  provider: MockPaymentProvider,
  subscriptionId: string,
  now: Date,
): Promise<PaymentEvent> {
  const sub = await subscriptionById(db, subscriptionId);
  if (!sub.providerRef) throw new Error("Abo hat keine Provider-Ref");
  const [{ n }] = await db.select({ n: count() }).from(payments).where(eq(payments.subscriptionId, subscriptionId));
  return provider.renewalEventFor(sub.providerRef, sub.priceRappen, n, now, "fan_subscription");
}

/** Verlängerung des Premium-Plans; periodIndex = Anzahl bisheriger Premium-Zahlungen des Creators. */
export async function premiumRenewalEvent(
  db: Db,
  provider: MockPaymentProvider,
  creatorId: string,
  amountRappen: number,
  now: Date,
): Promise<PaymentEvent> {
  const [row] = await db.select().from(premiumSubscriptions).where(eq(premiumSubscriptions.creatorId, creatorId));
  if (!row?.providerRef) throw new Error("Kein Premium-Abo mit Provider-Ref");
  const [{ n }] = await db
    .select({ n: count() })
    .from(payments)
    .where(and(eq(payments.payerId, creatorId), eq(payments.kind, "premium_plan")));
  return provider.renewalEventFor(row.providerRef, amountRappen, n, now, "premium_plan");
}

/** Schreibt eine erfolgreiche Fan-Zahlung direkt ins Ledger (ohne Abo-Logik). */
export async function insertFanPayment(
  db: Db,
  input: {
    creatorId: string;
    payerId?: string | null;
    subscriptionId?: string | null;
    grossRappen?: number;
    plan?: CreatorPlan;
    createdAt: Date;
    status?: "succeeded" | "refunded";
  },
): Promise<Payment> {
  const gross = input.grossRappen ?? 990;
  const plan = input.plan ?? "standard";
  const feeBps = plan === "premium" ? 500 : 1500;
  const split = splitPayment(gross, feeBps);
  const [row] = await db
    .insert(payments)
    .values({
      kind: "fan_subscription",
      subscriptionId: input.subscriptionId ?? null,
      payerId: input.payerId ?? null,
      creatorId: input.creatorId,
      grossRappen: gross,
      feeBps,
      platformFeeRappen: split.platformFeeRappen,
      creatorNetRappen: split.creatorNetRappen,
      creatorPlan: plan,
      provider: "mock",
      providerPaymentId: `testpay_${randomUUID()}`,
      status: input.status ?? "succeeded",
      createdAt: input.createdAt,
    })
    .returning();
  return row;
}

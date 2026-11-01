import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addBillingMonth } from "@/lib/domain/subscriptions";
import { auditLog, payments, platformSettings, subscriptions, users } from "@/server/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { setPaymentProviderForTesting, type PaymentEvent } from "@/server/payments";
import { completeMockCheckout, handlePaymentEvent } from "@/server/services/payment-events";
import { startSubscriptionCheckout } from "@/server/services/subscriptions";

import { setupTestDb } from "../helpers/db";
import { createCreator, createUser, makePremium, viewerFor } from "../helpers/factories";
import {
  fanRenewalEvent,
  paymentsForSubscription,
  sessionIdFrom,
  setupMockPayments,
  subscribeAndPay,
  subscriptionById,
} from "../helpers/task8";

const t = setupTestDb();
const NOW = new Date("2026-11-04T10:00:00Z");
const mock = setupMockPayments(NOW);
const DAY = 24 * 60 * 60 * 1000;

afterEach(() => {
  vi.restoreAllMocks();
});

async function setup(opts: { premium?: boolean; price?: number } = {}) {
  const fanUser = await createUser(t.db);
  const { user: creator } = await createCreator(t.db, {
    user: { handle: "mia_soles" },
    profile: { monthlyPriceRappen: opts.price ?? 990 },
  });
  if (opts.premium) await makePremium(t.db, creator.id, { now: NOW });
  return { fan: await viewerFor(t.db, fanUser.id, NOW), creatorId: creator.id };
}

async function checkout(fan: Awaited<ReturnType<typeof setup>>["fan"], creatorId: string) {
  const { redirectUrl } = await startSubscriptionCheckout(fan, { creatorId }, { now: NOW });
  return sessionIdFrom(redirectUrl);
}

describe("checkout.completed (Fan-Abo)", () => {
  it("aktiviert das Abo für einen Monat und bucht 15 % Provision (Standard)", async () => {
    const { fan, creatorId } = await setup();
    const sessionId = await checkout(fan, creatorId);

    const result = await completeMockCheckout(fan, sessionId, { now: NOW });

    expect(result).toEqual({ kind: "fan_subscription", creatorHandle: "mia_soles" });
    const [sub] = await t.db.select().from(subscriptions);
    expect(sub).toMatchObject({ status: "active", cancelAtPeriodEnd: false, providerRef: `mocksub_${sub.id}` });
    expect(sub.currentPeriodStart).toEqual(NOW);
    expect(sub.currentPeriodEnd).toEqual(addBillingMonth(NOW));

    const rows = await t.db.select().from(payments);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "fan_subscription",
      subscriptionId: sub.id,
      payerId: fan.id,
      creatorId,
      grossRappen: 990,
      feeBps: 1500,
      platformFeeRappen: 149,
      creatorNetRappen: 841,
      creatorPlan: "standard",
      provider: "mock",
      status: "succeeded",
    });
    expect(rows[0].createdAt).toEqual(NOW);
  });

  it("bucht 5 % Provision, wenn der Creator Premium hat", async () => {
    const { fan, creatorId } = await setup({ premium: true });
    await completeMockCheckout(fan, await checkout(fan, creatorId), { now: NOW });

    const [row] = await t.db.select().from(payments);
    expect(row).toMatchObject({ feeBps: 500, platformFeeRappen: 50, creatorNetRappen: 940, creatorPlan: "premium" });
  });

  it("schreibt einen Audit-Eintrag subscription.activated", async () => {
    const { fan, creatorId } = await setup();
    await completeMockCheckout(fan, await checkout(fan, creatorId), { now: NOW });

    const entries = await t.db.select().from(auditLog).where(eq(auditLog.action, "subscription.activated"));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorId: fan.id, targetType: "subscription" });
  });

  it("replayed event is idempotent: genau eine Zahlung, genau eine Verlängerung", async () => {
    const { fan, creatorId } = await setup();
    const sessionId = await checkout(fan, creatorId);
    const event = mock.provider.completedEventFor(sessionId, NOW);

    expect(await handlePaymentEvent(event, { now: NOW })).toEqual({ applied: true });
    const afterFirst = (await t.db.select().from(subscriptions))[0];

    // Webhook-Wiederholung und Doppelklick im Mock-Checkout (andere Uhrzeit, gleiche Session)
    expect(await handlePaymentEvent(event, { now: NOW })).toEqual({ applied: false });
    mock.clock.now = new Date(NOW.getTime() + 60_000);
    await completeMockCheckout(fan, sessionId, { now: mock.clock.now });

    expect(await t.db.select().from(payments)).toHaveLength(1);
    expect((await t.db.select().from(subscriptions))[0]).toEqual(afterFirst);
    expect(await t.db.select().from(auditLog).where(eq(auditLog.action, "subscription.activated"))).toHaveLength(1);
  });

  it("zwei Tabs (zwei Sessions): die zweite Zahlung verlängert nicht und wird nicht gebucht", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fan, creatorId } = await setup();
    const first = await checkout(fan, creatorId);
    mock.clock.now = new Date(NOW.getTime() + 1000); // andere Ablaufzeit → andere Session-ID
    const second = await checkout(fan, creatorId);
    expect(second).not.toBe(first);

    await completeMockCheckout(fan, first, { now: NOW });
    const afterFirst = (await t.db.select().from(subscriptions))[0];
    const event = mock.provider.completedEventFor(second, new Date(NOW.getTime() + 5000));
    expect(await handlePaymentEvent(event)).toEqual({ applied: false });

    expect(await t.db.select().from(payments)).toHaveLength(1);
    expect((await t.db.select().from(subscriptions))[0]).toEqual(afterFirst);
    expect(warn).toHaveBeenCalled();
  });

  it("ignoriert Events für unbekannte Abos oder fremde Zahler (ohne Schreibzugriff)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fan, creatorId } = await setup();
    const sessionId = await checkout(fan, creatorId);
    const event = mock.provider.completedEventFor(sessionId, NOW) as Extract<
      PaymentEvent,
      { type: "checkout.completed" }
    >;

    expect(await handlePaymentEvent({ ...event, referenceId: "00000000-0000-4000-8000-000000000000" })).toEqual({
      applied: false,
    });
    expect(await handlePaymentEvent({ ...event, referenceId: "kein-uuid" })).toEqual({ applied: false });
    const stranger = await createUser(t.db);
    expect(await handlePaymentEvent({ ...event, payerUserId: stranger.id })).toEqual({ applied: false });

    expect(await t.db.select().from(payments)).toHaveLength(0);
    expect((await t.db.select().from(subscriptions))[0].status).toBe("pending");
  });
});

describe("subscription.renewed (Fan-Abo)", () => {
  it("verlängert ab current_period_end mit dem aktuellen Satz; alte Zahlung bleibt unverändert", async () => {
    const { fan, creatorId } = await setup();
    const sub = await subscribeAndPay(t.db, fan, creatorId, NOW);
    const [firstPayment] = await paymentsForSubscription(t.db, sub.id);

    await t.db.update(platformSettings).set({ standardFeeBps: 2000 }).where(eq(platformSettings.id, 1));

    const firstEnd = addBillingMonth(NOW);
    const renewedAt = new Date(firstEnd.getTime() - DAY); // Verlängerung kurz vor Ablauf
    const event = await fanRenewalEvent(t.db, mock.provider, sub.id, renewedAt);
    expect(await handlePaymentEvent(event)).toEqual({ applied: true });

    const row = await subscriptionById(t.db, sub.id);
    expect(row.currentPeriodStart).toEqual(firstEnd);
    expect(row.currentPeriodEnd).toEqual(addBillingMonth(firstEnd));
    expect(row.status).toBe("active");

    const all = await paymentsForSubscription(t.db, sub.id);
    expect(all).toHaveLength(2);
    expect(all[0]).toEqual(firstPayment);
    expect(all[0]).toMatchObject({ feeBps: 1500, platformFeeRappen: 149 });
    expect(all[1]).toMatchObject({ feeBps: 2000, platformFeeRappen: 198, creatorNetRappen: 792, creatorPlan: "standard" });
    expect(all[1].createdAt).toEqual(renewedAt);
  });

  it("nutzt den Plan zum Zahlungszeitpunkt (Premium → 5 %)", async () => {
    const { fan, creatorId } = await setup();
    const sub = await subscribeAndPay(t.db, fan, creatorId, NOW);
    const renewedAt = new Date(addBillingMonth(NOW).getTime() - DAY);
    await makePremium(t.db, creatorId, { now: renewedAt });

    await handlePaymentEvent(await fanRenewalEvent(t.db, mock.provider, sub.id, renewedAt));

    const all = await paymentsForSubscription(t.db, sub.id);
    expect(all[1]).toMatchObject({ feeBps: 500, creatorPlan: "premium" });
  });

  it("eine wiederholte Verlängerung ist idempotent", async () => {
    const { fan, creatorId } = await setup();
    const sub = await subscribeAndPay(t.db, fan, creatorId, NOW);
    const event = await fanRenewalEvent(t.db, mock.provider, sub.id, addBillingMonth(NOW));

    expect(await handlePaymentEvent(event)).toEqual({ applied: true });
    const afterFirst = await subscriptionById(t.db, sub.id);
    expect(await handlePaymentEvent(event)).toEqual({ applied: false });

    expect(await paymentsForSubscription(t.db, sub.id)).toHaveLength(2);
    expect(await subscriptionById(t.db, sub.id)).toEqual(afterFirst);
  });

  it("ignoriert Verlängerungen für unbekannte oder abgelaufene Abos", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fan, creatorId } = await setup();
    const sub = await subscribeAndPay(t.db, fan, creatorId, NOW);

    const unknown = mock.provider.renewalEventFor("mocksub_unbekannt", 990, 1, NOW);
    expect(await handlePaymentEvent(unknown)).toEqual({ applied: false });

    await t.db.update(subscriptions).set({ status: "expired" }).where(eq(subscriptions.id, sub.id));
    expect(await handlePaymentEvent(await fanRenewalEvent(t.db, mock.provider, sub.id, NOW))).toEqual({
      applied: false,
    });
    expect(await paymentsForSubscription(t.db, sub.id)).toHaveLength(1);
  });
});

describe("subscription.canceled (Provider)", () => {
  it("setzt cancel_at_period_end; Wiederholung ändert nichts", async () => {
    const { fan, creatorId } = await setup();
    const sub = await subscribeAndPay(t.db, fan, creatorId, NOW);
    const canceledAt = new Date(NOW.getTime() + 2 * DAY);
    const event: PaymentEvent = {
      type: "subscription.canceled",
      provider: "mock",
      eventId: "mockevt_cancel_1",
      kind: "fan_subscription",
      providerSubscriptionRef: sub.providerRef!,
      occurredAt: canceledAt,
    };

    expect(await handlePaymentEvent(event)).toEqual({ applied: true });
    const row = await subscriptionById(t.db, sub.id);
    expect(row).toMatchObject({ status: "canceled", cancelAtPeriodEnd: true });
    expect(row.canceledAt).toEqual(canceledAt);
    expect(row.currentPeriodEnd).toEqual(addBillingMonth(NOW));

    expect(await handlePaymentEvent({ ...event, eventId: "mockevt_cancel_2" })).toEqual({ applied: false });
    expect(await subscriptionById(t.db, sub.id)).toEqual(row);
  });
});

describe("completeMockCheckout", () => {
  it("fremde Mock-Session → ForbiddenError, nichts wird gebucht", async () => {
    const { fan, creatorId } = await setup();
    const sessionId = await checkout(fan, creatorId);
    const other = await viewerFor(t.db, (await createUser(t.db)).id, NOW);

    await expect(completeMockCheckout(other, sessionId, { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await t.db.select().from(payments)).toHaveLength(0);
  });

  it("gesperrter Fan kann nicht bezahlen", async () => {
    const { fan, creatorId } = await setup();
    const sessionId = await checkout(fan, creatorId);
    await t.db.update(users).set({ status: "banned" }).where(eq(users.id, fan.id));

    await expect(
      completeMockCheckout(await viewerFor(t.db, fan.id, NOW), sessionId, { now: NOW }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await t.db.select().from(payments)).toHaveLength(0);
  });

  it("manipulierte oder abgelaufene Session → ValidationError", async () => {
    const { fan, creatorId } = await setup();
    const sessionId = await checkout(fan, creatorId);

    await expect(completeMockCheckout(fan, `${sessionId}x`, { now: NOW })).rejects.toBeInstanceOf(ValidationError);
    await expect(
      completeMockCheckout(fan, sessionId, { now: new Date(NOW.getTime() + 2 * 60 * 60 * 1000) }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await t.db.select().from(payments)).toHaveLength(0);
  });

  it("ist nicht verfügbar, wenn ein anderer Provider aktiv ist", async () => {
    const { fan, creatorId } = await setup();
    const sessionId = await checkout(fan, creatorId);
    setPaymentProviderForTesting(null);
    process.env.PAYMENT_PROVIDER = "ccbill";
    try {
      await expect(completeMockCheckout(fan, sessionId, { now: NOW })).rejects.toBeInstanceOf(NotFoundError);
    } finally {
      delete process.env.PAYMENT_PROVIDER;
      setPaymentProviderForTesting(mock.provider);
    }
    expect(await t.db.select().from(payments)).toHaveLength(0);
  });
});

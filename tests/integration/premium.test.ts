import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { addBillingMonth } from "@/lib/domain/subscriptions";
import { auditLog, payments, platformSettings, premiumSubscriptions } from "@/server/db/schema";
import { ConflictError, ForbiddenError } from "@/server/errors";
import { completeMockCheckout, handlePaymentEvent } from "@/server/services/payment-events";
import { cancelPremium, getPremiumStatus, startPremiumCheckout } from "@/server/services/premium";
import { startSubscriptionCheckout } from "@/server/services/subscriptions";

import { setupTestDb } from "../helpers/db";
import { createCreator, createUser, viewerFor } from "../helpers/factories";
import { buyPremium, premiumRenewalEvent, sessionIdFrom, setupMockPayments, subscribeAndPay } from "../helpers/task8";

const t = setupTestDb();
const NOW = new Date("2026-11-04T10:00:00Z");
const mock = setupMockPayments(NOW);
const DAY = 24 * 60 * 60 * 1000;

async function approvedCreator() {
  const { user } = await createCreator(t.db, { user: { handle: "nora_toes" } });
  return viewerFor(t.db, user.id, NOW);
}

describe("getPremiumStatus", () => {
  it("Standard-Creator: kein Premium, aktueller Preis und Sätze aus den Einstellungen", async () => {
    const creator = await approvedCreator();
    await t.db.update(platformSettings).set({ premiumPriceRappen: 2400 }).where(eq(platformSettings.id, 1));

    expect(await getPremiumStatus(creator, { now: NOW })).toEqual({
      isPremium: false,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      priceRappen: 2400,
      standardFeeBps: 1500,
      premiumFeeBps: 500,
    });
  });

  it("nur für Creator", async () => {
    const fan = await viewerFor(t.db, (await createUser(t.db)).id, NOW);
    await expect(getPremiumStatus(fan, { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("startPremiumCheckout", () => {
  it("startet einen Checkout über den aktuellen Premium-Preis", async () => {
    const creator = await approvedCreator();
    const { redirectUrl } = await startPremiumCheckout(creator, { now: NOW, appUrl: "https://hf.ch" });

    expect(mock.provider.decodeSession(sessionIdFrom(redirectUrl), NOW)).toMatchObject({
      kind: "premium_plan",
      referenceId: creator.id,
      payerUserId: creator.id,
      amountRappen: 1900,
      successUrl: "https://hf.ch/studio/premium?ok=1",
      cancelUrl: "https://hf.ch/studio/premium",
    });
  });

  it("nur freigegebene Creator", async () => {
    const { user } = await createCreator(t.db, { profile: { verificationStatus: "pending" } });
    await expect(startPremiumCheckout(await viewerFor(t.db, user.id, NOW), { now: NOW })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const fan = await viewerFor(t.db, (await createUser(t.db)).id, NOW);
    await expect(startPremiumCheckout(fan, { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("nicht, wenn Premium schon läuft (auch gekündigt bis Periodenende)", async () => {
    const creator = await approvedCreator();
    await buyPremium(creator, NOW);
    await expect(startPremiumCheckout(creator, { now: NOW })).rejects.toBeInstanceOf(ConflictError);

    await cancelPremium(creator, { now: NOW });
    await expect(startPremiumCheckout(creator, { now: new Date(NOW.getTime() + DAY) })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

describe("Premium-Abschluss", () => {
  it("aktiviert Premium; die Zahlung ist reiner Plattform-Umsatz (fee_bps 10000, creator_net 0)", async () => {
    const creator = await approvedCreator();
    const { redirectUrl } = await startPremiumCheckout(creator, { now: NOW });

    const result = await completeMockCheckout(creator, sessionIdFrom(redirectUrl), { now: NOW });

    expect(result).toEqual({ kind: "premium_plan", creatorHandle: null });
    const [row] = await t.db.select().from(premiumSubscriptions);
    expect(row).toMatchObject({
      creatorId: creator.id,
      status: "active",
      priceRappen: 1900,
      cancelAtPeriodEnd: false,
      provider: "mock",
      providerRef: `mocksub_${creator.id}`,
    });
    expect(row.currentPeriodStart).toEqual(NOW);
    expect(row.currentPeriodEnd).toEqual(addBillingMonth(NOW));

    const [payment] = await t.db.select().from(payments);
    expect(payment).toMatchObject({
      kind: "premium_plan",
      premiumSubscriptionId: row.id,
      subscriptionId: null,
      payerId: creator.id,
      creatorId: null,
      grossRappen: 1900,
      feeBps: 10000,
      platformFeeRappen: 1900,
      creatorNetRappen: 0,
    });
    expect(payment.createdAt).toEqual(NOW);

    const status = await getPremiumStatus(creator, { now: NOW });
    expect(status).toMatchObject({ isPremium: true, cancelAtPeriodEnd: false, priceRappen: 1900 });
    expect(status.currentPeriodEnd).toEqual(addBillingMonth(NOW));
    expect((await viewerFor(t.db, creator.id, NOW)).creator?.isPremium).toBe(true);

    const entries = await t.db.select().from(auditLog).where(eq(auditLog.action, "premium.activated"));
    expect(entries).toHaveLength(1);
  });

  it("Fan-Zahlungen nach dem Upgrade kosten 5 % Provision", async () => {
    const creator = await approvedCreator();
    await buyPremium(creator, NOW);
    const fan = await viewerFor(t.db, (await createUser(t.db)).id, NOW);

    await subscribeAndPay(t.db, fan, creator.id, NOW);

    const [fanPayment] = await t.db.select().from(payments).where(eq(payments.kind, "fan_subscription"));
    expect(fanPayment).toMatchObject({ feeBps: 500, creatorNetRappen: 940, creatorPlan: "premium" });
  });

  it("Wiederholung desselben Events bucht nur einmal", async () => {
    const creator = await approvedCreator();
    const { redirectUrl } = await startPremiumCheckout(creator, { now: NOW });
    const event = mock.provider.completedEventFor(sessionIdFrom(redirectUrl), NOW);

    expect(await handlePaymentEvent(event)).toEqual({ applied: true });
    expect(await handlePaymentEvent(event)).toEqual({ applied: false });
    expect(await t.db.select().from(payments)).toHaveLength(1);
  });

  it("zwei Tabs: eine zweite Premium-Zahlung bei laufendem Premium verlängert nicht und wird nicht gebucht", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const creator = await approvedCreator();
    const first = sessionIdFrom((await startPremiumCheckout(creator, { now: NOW })).redirectUrl);
    mock.clock.now = new Date(NOW.getTime() + 1000); // andere Ablaufzeit → andere Session/Zahlungs-ID
    const second = sessionIdFrom((await startPremiumCheckout(creator, { now: NOW })).redirectUrl);
    expect(second).not.toBe(first);

    await completeMockCheckout(creator, first, { now: NOW });
    const [afterFirst] = await t.db.select().from(premiumSubscriptions);
    const event = mock.provider.completedEventFor(second, new Date(NOW.getTime() + 5000));
    expect(await handlePaymentEvent(event)).toEqual({ applied: false });

    expect(await t.db.select().from(payments)).toHaveLength(1);
    expect(await t.db.select().from(premiumSubscriptions)).toEqual([afterFirst]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ein erneuter Abschluss nach Ablauf reaktiviert dieselbe Zeile mit neuem Preis-Snapshot", async () => {
    const creator = await approvedCreator();
    await buyPremium(creator, NOW);
    await cancelPremium(creator, { now: NOW });
    const [first] = await t.db.select().from(premiumSubscriptions);

    const later = new Date(addBillingMonth(NOW).getTime() + 3 * DAY);
    mock.clock.now = later;
    await t.db.update(platformSettings).set({ premiumPriceRappen: 2200 }).where(eq(platformSettings.id, 1));
    expect((await getPremiumStatus(creator, { now: later })).isPremium).toBe(false);

    await buyPremium(creator, later);

    const rows = await t.db.select().from(premiumSubscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: first.id, status: "active", cancelAtPeriodEnd: false, priceRappen: 2200 });
    expect(rows[0].canceledAt).toBeNull();
    expect(rows[0].currentPeriodStart).toEqual(later);
    expect(rows[0].currentPeriodEnd).toEqual(addBillingMonth(later));
    expect(await t.db.select().from(payments)).toHaveLength(2);
  });

  it("Verlängerung (periodIndex = Anzahl Premium-Zahlungen) verlängert ab Periodenende", async () => {
    const creator = await approvedCreator();
    await buyPremium(creator, NOW);
    const end = addBillingMonth(NOW);

    const event = await premiumRenewalEvent(t.db, mock.provider, creator.id, 1900, end);
    expect(await handlePaymentEvent(event)).toEqual({ applied: true });
    expect(await handlePaymentEvent(event)).toEqual({ applied: false });

    const [row] = await t.db.select().from(premiumSubscriptions);
    expect(row.currentPeriodStart).toEqual(end);
    expect(row.currentPeriodEnd).toEqual(addBillingMonth(end));
    const premiumPayments = await t.db.select().from(payments).where(eq(payments.kind, "premium_plan"));
    expect(premiumPayments).toHaveLength(2);
    expect(premiumPayments.every((p) => p.feeBps === 10000 && p.creatorNetRappen === 0)).toBe(true);
  });
});

describe("Gebühren- und Preis-Snapshots bei verspäteten Events", () => {
  async function pendingFanCheckout(creatorId: string, at: Date) {
    const fan = await viewerFor(t.db, (await createUser(t.db)).id, at);
    const { redirectUrl } = await startSubscriptionCheckout(fan, { creatorId }, { now: at });
    return sessionIdFrom(redirectUrl);
  }

  it("eine Fan-Zahlung vor dem Premium-Kauf wird auch bei verspätetem Webhook mit dem Standard-Satz gebucht", async () => {
    const creator = await approvedCreator();
    const paidAt = new Date(NOW.getTime() - 60 * 60 * 1000);
    mock.clock.now = paidAt;
    const event = mock.provider.completedEventFor(await pendingFanCheckout(creator.id, paidAt), paidAt);

    mock.clock.now = NOW;
    await buyPremium(creator, NOW); // Creator bucht Premium, bevor der Webhook der Fan-Zahlung ankommt
    expect(await handlePaymentEvent(event, { now: new Date(NOW.getTime() + 30 * 60 * 1000) })).toEqual({ applied: true });

    const [fanPayment] = await t.db.select().from(payments).where(eq(payments.kind, "fan_subscription"));
    expect(fanPayment).toMatchObject({ feeBps: 1500, platformFeeRappen: 149, creatorPlan: "standard" });
  });

  it("eine verspätete Fan-Zahlung aus einer früheren, inzwischen verlängerten Premium-Periode bleibt bei 5 %", async () => {
    const creator = await approvedCreator();
    await buyPremium(creator, NOW);
    const paidAt = new Date(NOW.getTime() + 10 * DAY);
    mock.clock.now = paidAt;
    const event = mock.provider.completedEventFor(await pendingFanCheckout(creator.id, paidAt), paidAt);

    const end = addBillingMonth(NOW);
    expect(await handlePaymentEvent(await premiumRenewalEvent(t.db, mock.provider, creator.id, 1900, end))).toEqual({
      applied: true,
    });
    expect(await handlePaymentEvent(event, { now: new Date(end.getTime() + DAY) })).toEqual({ applied: true });

    const [fanPayment] = await t.db.select().from(payments).where(eq(payments.kind, "fan_subscription"));
    expect(fanPayment).toMatchObject({ feeBps: 500, creatorPlan: "premium" });
  });

  it("der Premium-Preis-Snapshot ist der bezahlte Betrag, nicht der inzwischen geänderte Preis", async () => {
    const creator = await approvedCreator();
    const { redirectUrl } = await startPremiumCheckout(creator, { now: NOW });
    await t.db.update(platformSettings).set({ premiumPriceRappen: 2500 }).where(eq(platformSettings.id, 1));

    await completeMockCheckout(creator, sessionIdFrom(redirectUrl), { now: NOW });

    const [row] = await t.db.select().from(premiumSubscriptions);
    expect(row.priceRappen).toBe(1900);
    expect((await getPremiumStatus(creator, { now: NOW })).priceRappen).toBe(1900);
    const [payment] = await t.db.select().from(payments);
    expect(payment.grossRappen).toBe(1900);
  });
});

describe("cancelPremium", () => {
  it("kündigt zum Periodenende: Premium bleibt bis dahin aktiv, danach Standard", async () => {
    const creator = await approvedCreator();
    await buyPremium(creator, NOW);
    const end = addBillingMonth(NOW);

    await cancelPremium(creator, { now: new Date(NOW.getTime() + DAY) });

    const [row] = await t.db.select().from(premiumSubscriptions);
    expect(row).toMatchObject({ status: "canceled", cancelAtPeriodEnd: true });
    expect(row.canceledAt).toEqual(new Date(NOW.getTime() + DAY));

    const during = await getPremiumStatus(creator, { now: new Date(end.getTime() - 1000) });
    expect(during).toMatchObject({ isPremium: true, cancelAtPeriodEnd: true });
    const after = await getPremiumStatus(creator, { now: new Date(end.getTime() + 1000) });
    expect(after).toMatchObject({ isPremium: false, currentPeriodEnd: null });

    expect(await t.db.select().from(auditLog).where(eq(auditLog.action, "premium.canceled"))).toHaveLength(1);
  });

  it("ist idempotent und verlangt ein laufendes Premium", async () => {
    const creator = await approvedCreator();
    await expect(cancelPremium(creator, { now: NOW })).rejects.toBeInstanceOf(ConflictError);

    await buyPremium(creator, NOW);
    await cancelPremium(creator, { now: NOW });
    await cancelPremium(creator, { now: NOW });
    expect(await t.db.select().from(auditLog).where(eq(auditLog.action, "premium.canceled"))).toHaveLength(1);
  });

  it("Kündigung durch den Anbieter (subscription.canceled) wirkt zum Periodenende; Wiederholung ändert nichts", async () => {
    const creator = await approvedCreator();
    await buyPremium(creator, NOW);
    const canceledAt = new Date(NOW.getTime() + 2 * DAY);
    const event = {
      type: "subscription.canceled" as const,
      provider: "mock",
      eventId: "mockevt_premium_cancel_1",
      kind: "premium_plan" as const,
      providerSubscriptionRef: `mocksub_${creator.id}`,
      occurredAt: canceledAt,
    };

    expect(await handlePaymentEvent(event)).toEqual({ applied: true });
    const [row] = await t.db.select().from(premiumSubscriptions);
    expect(row).toMatchObject({ status: "canceled", cancelAtPeriodEnd: true });
    expect(row.canceledAt).toEqual(canceledAt);
    expect(row.currentPeriodEnd).toEqual(addBillingMonth(NOW));
    expect((await getPremiumStatus(creator, { now: canceledAt })).isPremium).toBe(true);

    expect(await handlePaymentEvent({ ...event, eventId: "mockevt_premium_cancel_2" })).toEqual({ applied: false });
    expect(await t.db.select().from(premiumSubscriptions)).toEqual([row]);
    const entries = await t.db.select().from(auditLog).where(eq(auditLog.action, "premium.canceled"));
    expect(entries).toHaveLength(1);
    expect(entries[0].actorId).toBeNull();
  });

  it("eine wieder eingespielte alte Anbieter-Kündigung beendet ein später neu gebuchtes Premium nicht", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const creator = await approvedCreator();
    await buyPremium(creator, NOW);
    const cancel = {
      type: "subscription.canceled" as const,
      provider: "mock",
      eventId: "mockevt_premium_cancel_old",
      kind: "premium_plan" as const,
      providerSubscriptionRef: `mocksub_${creator.id}`,
      occurredAt: new Date(NOW.getTime() + 2 * DAY),
    };
    expect(await handlePaymentEvent(cancel)).toEqual({ applied: true });

    const later = new Date(addBillingMonth(NOW).getTime() + 10 * DAY);
    mock.clock.now = later;
    await buyPremium(creator, later);
    expect((await t.db.select().from(premiumSubscriptions))[0]).toMatchObject({ status: "active" });

    // Replay desselben (signierten) Bodys Wochen später
    expect(await handlePaymentEvent(cancel, { now: new Date(later.getTime() + DAY) })).toEqual({ applied: false });
    const [row] = await t.db.select().from(premiumSubscriptions);
    expect(row).toMatchObject({ status: "active", cancelAtPeriodEnd: false, canceledAt: null });
    warn.mockRestore();
  });
});

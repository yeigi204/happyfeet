import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addBillingMonth } from "@/lib/domain/subscriptions";
import { creatorProfiles, subscriptions, users } from "@/server/db/schema";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { setMediaStorageForTesting } from "@/server/storage";
import { InMemoryMediaStorage } from "@/server/storage/memory";
import {
  cancelSubscription,
  listMySubscriptions,
  startSubscriptionCheckout,
} from "@/server/services/subscriptions";

import { setupTestDb } from "../helpers/db";
import { createCreator, createUser, viewerFor } from "../helpers/factories";
import { sessionIdFrom, setupMockPayments, subscribeAndPay, subscriptionById } from "../helpers/task8";

// setupTestDb ist kein React-Hook, sondern registriert Vitest-Hooks.
const t = setupTestDb();
const NOW = new Date("2026-11-04T10:00:00Z");
const payments = setupMockPayments(NOW);
const DAY = 24 * 60 * 60 * 1000;

beforeAll(() => {
  setMediaStorageForTesting(new InMemoryMediaStorage());
});

afterAll(() => {
  setMediaStorageForTesting(null);
});

async function fanAndCreator(opts: { price?: number } = {}) {
  const fanUser = await createUser(t.db);
  const { user: creatorUser } = await createCreator(t.db, {
    user: { handle: "lena_feet" },
    profile: { monthlyPriceRappen: opts.price ?? 990 },
  });
  return { fan: await viewerFor(t.db, fanUser.id, NOW), creatorId: creatorUser.id };
}

async function pairRows(fanId: string, creatorId: string) {
  return t.db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.fanId, fanId), eq(subscriptions.creatorId, creatorId)));
}

describe("startSubscriptionCheckout", () => {
  it("legt ein pending-Abo mit Preis-Snapshot an und liefert die Mock-Checkout-URL", async () => {
    const { fan, creatorId } = await fanAndCreator({ price: 1290 });

    const { redirectUrl } = await startSubscriptionCheckout(fan, { creatorId }, { now: NOW, appUrl: "https://hf.ch/" });

    const rows = await pairRows(fan.id, creatorId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "pending", priceRappen: 1290, provider: "mock" });

    const session = payments.provider.decodeSession(sessionIdFrom(redirectUrl), NOW);
    expect(session).toMatchObject({
      kind: "fan_subscription",
      referenceId: rows[0].id,
      payerUserId: fan.id,
      amountRappen: 1290,
      currency: "CHF",
      successUrl: "https://hf.ch/c/lena_feet?abo=ok",
      cancelUrl: "https://hf.ch/c/lena_feet",
    });
  });

  it("nutzt APP_URL bzw. localhost als Basis für die Rücksprung-URLs", async () => {
    const { fan, creatorId } = await fanAndCreator();
    const { redirectUrl } = await startSubscriptionCheckout(fan, { creatorId }, { now: NOW });
    expect(payments.provider.decodeSession(sessionIdFrom(redirectUrl), NOW)?.successUrl).toBe(
      "http://localhost:3000/c/lena_feet?abo=ok",
    );

    process.env.APP_URL = "https://happyfeet.example";
    try {
      const again = await startSubscriptionCheckout(fan, { creatorId }, { now: NOW });
      expect(payments.provider.decodeSession(sessionIdFrom(again.redirectUrl), NOW)?.cancelUrl).toBe(
        "https://happyfeet.example/c/lena_feet",
      );
    } finally {
      delete process.env.APP_URL;
    }
  });

  it("verwendet eine vorhandene pending-Zeile wieder und aktualisiert den Preis-Snapshot", async () => {
    const { fan, creatorId } = await fanAndCreator({ price: 990 });
    await startSubscriptionCheckout(fan, { creatorId }, { now: NOW });
    await t.db.update(creatorProfiles).set({ monthlyPriceRappen: 1490 }).where(eq(creatorProfiles.userId, creatorId));

    const { redirectUrl } = await startSubscriptionCheckout(fan, { creatorId }, { now: NOW });

    const rows = await pairRows(fan.id, creatorId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "pending", priceRappen: 1490 });
    expect(payments.provider.decodeSession(sessionIdFrom(redirectUrl), NOW)).toMatchObject({
      referenceId: rows[0].id,
      amountRappen: 1490,
    });
  });

  it("wirft ConflictError, wenn das Abo schon aktiv ist", async () => {
    const { fan, creatorId } = await fanAndCreator();
    await subscribeAndPay(t.db, fan, creatorId, NOW);

    await expect(startSubscriptionCheckout(fan, { creatorId }, { now: NOW })).rejects.toBeInstanceOf(ConflictError);
  });

  it("wirft ConflictError auch für ein gekündigtes Abo, das noch läuft", async () => {
    const { fan, creatorId } = await fanAndCreator();
    const sub = await subscribeAndPay(t.db, fan, creatorId, NOW);
    await cancelSubscription(fan, sub.id, { now: NOW });

    await expect(
      startSubscriptionCheckout(fan, { creatorId }, { now: new Date(NOW.getTime() + DAY) }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("verbietet das Abonnieren des eigenen Profils", async () => {
    const { user } = await createCreator(t.db);
    const self = await viewerFor(t.db, user.id, NOW);

    await expect(startSubscriptionCheckout(self, { creatorId: user.id }, { now: NOW })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await t.db.select().from(subscriptions)).toHaveLength(0);
  });

  it("gesperrter Fan kann nicht abonnieren", async () => {
    const { fan, creatorId } = await fanAndCreator();
    await t.db.update(users).set({ status: "banned", bannedAt: NOW }).where(eq(users.id, fan.id));
    const banned = await viewerFor(t.db, fan.id, NOW);

    await expect(startSubscriptionCheckout(banned, { creatorId }, { now: NOW })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(await t.db.select().from(subscriptions)).toHaveLength(0);
  });

  it("verlangt ein abgeschlossenes Onboarding", async () => {
    const { creatorId } = await fanAndCreator();
    const fresh = await createUser(t.db, { handle: null, displayName: null, onboardedAt: null });
    await expect(
      startSubscriptionCheckout(await viewerFor(t.db, fresh.id, NOW), { creatorId }, { now: NOW }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it.each([
    ["nicht freigegeben", { profile: { verificationStatus: "pending" as const } }],
    ["abgelehnt", { profile: { verificationStatus: "rejected" as const } }],
    ["gesperrt", { user: { status: "banned" as const } }],
  ])("Creator %s → NotFoundError", async (_label, opts) => {
    const fanUser = await createUser(t.db);
    const { user } = await createCreator(t.db, opts);
    await expect(
      startSubscriptionCheckout(await viewerFor(t.db, fanUser.id, NOW), { creatorId: user.id }, { now: NOW }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("unbekannter oder ungültiger Creator → NotFoundError", async () => {
    const fan = await viewerFor(t.db, (await createUser(t.db)).id, NOW);
    const plainUser = await createUser(t.db);
    for (const creatorId of ["00000000-0000-4000-8000-000000000000", "kein-uuid", plainUser.id]) {
      await expect(startSubscriptionCheckout(fan, { creatorId }, { now: NOW })).rejects.toBeInstanceOf(NotFoundError);
    }
  });
});

describe("cancelSubscription", () => {
  it("kündigt zum Periodenende: Zugriff bis dahin, danach nicht mehr", async () => {
    const { fan, creatorId } = await fanAndCreator();
    const sub = await subscribeAndPay(t.db, fan, creatorId, NOW);
    const end = addBillingMonth(NOW);

    await cancelSubscription(fan, sub.id, { now: new Date(NOW.getTime() + 3 * DAY) });

    const row = await subscriptionById(t.db, sub.id);
    expect(row).toMatchObject({ status: "canceled", cancelAtPeriodEnd: true });
    expect(row.canceledAt).toEqual(new Date(NOW.getTime() + 3 * DAY));
    expect(row.currentPeriodEnd).toEqual(end);

    const before = await listMySubscriptions(fan, { now: new Date(end.getTime() - 1000) });
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ id: sub.id, status: "canceled", cancelAtPeriodEnd: true, active: true });

    const after = await listMySubscriptions(fan, { now: new Date(end.getTime() + 1000) });
    expect(after[0]).toMatchObject({ id: sub.id, active: false });
  });

  it("ist idempotent für bereits gekündigte Abos", async () => {
    const { fan, creatorId } = await fanAndCreator();
    const sub = await subscribeAndPay(t.db, fan, creatorId, NOW);
    await cancelSubscription(fan, sub.id, { now: NOW });
    const first = await subscriptionById(t.db, sub.id);

    await cancelSubscription(fan, sub.id, { now: new Date(NOW.getTime() + DAY) });

    expect(await subscriptionById(t.db, sub.id)).toEqual(first);
  });

  it("fremde Abos sind nicht auffindbar", async () => {
    const { fan, creatorId } = await fanAndCreator();
    const sub = await subscribeAndPay(t.db, fan, creatorId, NOW);
    const other = await viewerFor(t.db, (await createUser(t.db)).id, NOW);

    await expect(cancelSubscription(other, sub.id, { now: NOW })).rejects.toBeInstanceOf(NotFoundError);
    await expect(cancelSubscription(other, "kein-uuid", { now: NOW })).rejects.toBeInstanceOf(NotFoundError);
    expect((await subscriptionById(t.db, sub.id)).status).toBe("active");
  });

  it("ein pending-Abo kann nicht gekündigt werden", async () => {
    const { fan, creatorId } = await fanAndCreator();
    await startSubscriptionCheckout(fan, { creatorId }, { now: NOW });
    const [pending] = await pairRows(fan.id, creatorId);

    await expect(cancelSubscription(fan, pending.id, { now: NOW })).rejects.toBeInstanceOf(ConflictError);
  });

  it("gesperrter Fan kann nicht kündigen (keine Mutation)", async () => {
    const { fan, creatorId } = await fanAndCreator();
    const sub = await subscribeAndPay(t.db, fan, creatorId, NOW);
    await t.db.update(users).set({ status: "banned" }).where(eq(users.id, fan.id));

    await expect(
      cancelSubscription(await viewerFor(t.db, fan.id, NOW), sub.id, { now: NOW }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("resubscribe after expiry", () => {
  it("eine alte canceled-Zeile blockiert ein neues Abo nicht", async () => {
    const { fan, creatorId } = await fanAndCreator();
    const old = await subscribeAndPay(t.db, fan, creatorId, NOW);
    await cancelSubscription(fan, old.id, { now: NOW });

    const later = new Date(addBillingMonth(NOW).getTime() + DAY);
    payments.clock.now = later;
    const fresh = await subscribeAndPay(t.db, fan, creatorId, later);

    expect(fresh.id).not.toBe(old.id);
    expect(fresh).toMatchObject({ status: "active", cancelAtPeriodEnd: false });
    expect(fresh.currentPeriodEnd).toEqual(addBillingMonth(later));
    expect((await subscriptionById(t.db, old.id)).status).toBe("expired");

    const mine = await listMySubscriptions(fan, { now: later });
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: fresh.id, active: true });
  });

  it("auch ein nie verlängertes, abgelaufenes active-Abo wird ersetzt", async () => {
    const { fan, creatorId } = await fanAndCreator();
    const old = await subscribeAndPay(t.db, fan, creatorId, NOW);

    const later = new Date(addBillingMonth(NOW).getTime() + 2 * DAY);
    payments.clock.now = later;
    const fresh = await subscribeAndPay(t.db, fan, creatorId, later);

    expect(fresh.id).not.toBe(old.id);
    expect((await subscriptionById(t.db, old.id)).status).toBe("expired");
  });
});

describe("listMySubscriptions", () => {
  it("liefert eigene Abos mit Creator-Daten, ohne pending-Checkouts", async () => {
    const fan = await viewerFor(t.db, (await createUser(t.db)).id, NOW);
    const { user: a } = await createCreator(t.db, {
      user: { handle: "anna", displayName: "Anna" },
      profile: { monthlyPriceRappen: 1290 },
    });
    const { user: b } = await createCreator(t.db, { user: { handle: "bea" } });
    await subscribeAndPay(t.db, fan, a.id, NOW);
    await startSubscriptionCheckout(fan, { creatorId: b.id }, { now: NOW });

    const mine = await listMySubscriptions(fan, { now: NOW });

    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      creator: { userId: a.id, handle: "anna", displayName: "Anna", avatarUrl: null },
      status: "active",
      priceRappen: 1290,
      cancelAtPeriodEnd: false,
      active: true,
    });
    expect(mine[0].currentPeriodEnd).toEqual(addBillingMonth(NOW));
  });

  it("signiert den Avatar des Creators", async () => {
    const { fan, creatorId } = await fanAndCreator();
    await t.db.update(users).set({ avatarKey: "avatars/lena.webp" }).where(eq(users.id, creatorId));
    await subscribeAndPay(t.db, fan, creatorId, NOW);

    const [item] = await listMySubscriptions(fan, { now: NOW });
    expect(item.creator.avatarUrl).toMatch(/^memory:\/\/avatars\/lena\.webp\?exp=\d+$/);
  });

  it("zeigt keine Abos fremder Fans und blendet gesperrte Creator aus", async () => {
    const { fan, creatorId } = await fanAndCreator();
    await subscribeAndPay(t.db, fan, creatorId, NOW);
    const other = await viewerFor(t.db, (await createUser(t.db)).id, NOW);
    expect(await listMySubscriptions(other, { now: NOW })).toEqual([]);

    await t.db.update(users).set({ status: "banned" }).where(eq(users.id, creatorId));
    expect(await listMySubscriptions(fan, { now: NOW })).toEqual([]);
  });
});

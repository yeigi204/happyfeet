import { describe, expect, it } from "vitest";

import { ForbiddenError } from "@/server/errors";
import { getCreatorBalance } from "@/server/services/payouts";
import { countActiveSubscribers, countApprovedPosts, getStudioStats } from "@/server/services/studio-stats";

import { setupTestDb } from "../helpers/db";
import {
  createActiveSubscription,
  createCreator,
  createPost,
  createUser,
  makePremium,
  viewerFor,
} from "../helpers/factories";
import { insertFanPayment } from "../helpers/task8";

const t = setupTestDb();
const NOW = new Date("2026-11-04T10:00:00Z");
const d = (iso: string) => new Date(iso);

/**
 * Premium-Creator mit vier Abos:
 * - A: aktiv seit 10.10., Verlängerung am 03.11. (je 990 → 940 netto)
 * - B: aktiv seit 02.11. (1490 → 1415 netto)
 * - C: seit 01.09., am 01.11. gekündigt, läuft bis 01.12.
 * - D: Juli, längst abgelaufen (ausserhalb des 90-Tage-Fensters)
 * plus eine Zahlung genau am ersten Tag des Fensters und eine knapp davor.
 */
async function premiumFixture() {
  const { user: creator } = await createCreator(t.db, { user: { handle: "stats_creator" } });
  await makePremium(t.db, creator.id, { now: NOW });
  const fans = await Promise.all([1, 2, 3, 4].map(() => createUser(t.db)));

  const a = await createActiveSubscription(t.db, fans[0].id, creator.id, {
    priceRappen: 990,
    currentPeriodStart: d("2026-11-03T10:00:00Z"),
    currentPeriodEnd: d("2026-12-03T10:00:00Z"),
  });
  const b = await createActiveSubscription(t.db, fans[1].id, creator.id, {
    priceRappen: 1490,
    currentPeriodStart: d("2026-11-02T08:00:00Z"),
    currentPeriodEnd: d("2026-12-02T08:00:00Z"),
  });
  const c = await createActiveSubscription(t.db, fans[2].id, creator.id, {
    status: "canceled",
    cancelAtPeriodEnd: true,
    canceledAt: d("2026-11-01T15:00:00Z"),
    currentPeriodStart: d("2026-11-01T09:00:00Z"),
    currentPeriodEnd: d("2026-12-01T09:00:00Z"),
  });
  const dd = await createActiveSubscription(t.db, fans[3].id, creator.id, {
    status: "expired",
    canceledAt: d("2026-07-20T10:00:00Z"),
    currentPeriodStart: d("2026-07-01T10:00:00Z"),
    currentPeriodEnd: d("2026-08-01T10:00:00Z"),
  });

  const pay = (subscriptionId: string | null, createdAt: string, grossRappen = 990) =>
    insertFanPayment(t.db, { creatorId: creator.id, subscriptionId, plan: "premium", grossRappen, createdAt: d(createdAt) });
  await pay(a.id, "2026-10-10T10:00:00Z");
  await pay(a.id, "2026-11-03T10:00:00Z");
  await pay(b.id, "2026-11-02T08:00:00Z", 1490);
  await pay(c.id, "2026-09-01T09:00:00Z");
  await pay(c.id, "2026-10-01T09:00:00Z");
  await pay(c.id, "2026-11-01T09:00:00Z");
  await pay(dd.id, "2026-07-01T10:00:00Z");
  await pay(null, "2026-08-07T00:00:00Z"); // erster Tag im Fenster
  await pay(null, "2026-08-06T23:59:59Z"); // knapp davor
  await insertFanPayment(t.db, {
    creatorId: creator.id,
    plan: "premium",
    status: "refunded",
    createdAt: d("2026-11-03T11:00:00Z"),
  });

  await createPost(t.db, creator.id);
  await createPost(t.db, creator.id);
  await createPost(t.db, creator.id, { moderationStatus: "pending", publishedAt: null });
  await createPost(t.db, creator.id, { moderationStatus: "rejected" });
  await createPost(t.db, creator.id, { deletedAt: d("2026-11-01T00:00:00Z") });

  return { viewer: await viewerFor(t.db, creator.id, NOW) };
}

describe("getStudioStats", () => {
  it("Basis-Statistik: Abonnenten, Monatseinnahmen, Posts, Guthaben", async () => {
    const { viewer } = await premiumFixture();

    const stats = await getStudioStats(viewer, { now: NOW });

    expect(stats.plan).toBe("premium");
    expect(stats.basic).toEqual({
      activeSubscribers: 3,
      grossThisMonthRappen: 990 + 1490 + 990,
      netThisMonthRappen: 940 + 1415 + 940,
      postCount: 2,
      pendingPostCount: 1,
      balance: await getCreatorBalance(viewer, { now: NOW }),
    });
  });

  it("Premium: MRR, Churn und eine lückenlose 90-Tage-Reihe", async () => {
    const { viewer } = await premiumFixture();

    const { advanced } = await getStudioStats(viewer, { now: NOW });

    expect(advanced).not.toBeNull();
    expect(advanced!.mrrRappen).toBe(990 + 1490);
    // 1 Kündigung in 30 Tagen bei 2 weiterlaufenden Abos
    expect(advanced!.churnRate30d).toBeCloseTo(1 / 3, 10);

    const daily = advanced!.daily;
    expect(daily).toHaveLength(90);
    expect(daily[0].date).toBe("2026-08-07");
    expect(daily[89].date).toBe("2026-11-04");
    const dates = daily.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(90);

    const at = (date: string) => daily.find((p) => p.date === date)!;
    expect(at("2026-08-07")).toEqual({ date: "2026-08-07", netRappen: 940, newSubs: 0, canceledSubs: 0 });
    expect(at("2026-09-01")).toEqual({ date: "2026-09-01", netRappen: 940, newSubs: 1, canceledSubs: 0 });
    expect(at("2026-10-10")).toMatchObject({ netRappen: 940, newSubs: 1 });
    expect(at("2026-11-01")).toEqual({ date: "2026-11-01", netRappen: 940, newSubs: 0, canceledSubs: 1 });
    expect(at("2026-11-02")).toMatchObject({ netRappen: 1415, newSubs: 1 });
    expect(at("2026-11-03")).toMatchObject({ netRappen: 940, newSubs: 0 });
    expect(at("2026-11-04")).toEqual({ date: "2026-11-04", netRappen: 0, newSubs: 0, canceledSubs: 0 });

    const totalNet = daily.reduce((sum, p) => sum + p.netRappen, 0);
    expect(totalNet).toBe(940 * 6 + 1415);
    expect(daily.reduce((sum, p) => sum + p.newSubs, 0)).toBe(3);
    expect(daily.reduce((sum, p) => sum + p.canceledSubs, 0)).toBe(1);
  });

  it("Standard-Creator: keine erweiterte Statistik", async () => {
    const { user } = await createCreator(t.db);
    const fan = await createUser(t.db);
    await createActiveSubscription(t.db, fan.id, user.id, { currentPeriodEnd: d("2026-11-20T00:00:00Z") });
    await insertFanPayment(t.db, { creatorId: user.id, createdAt: d("2026-11-02T10:00:00Z") });

    const stats = await getStudioStats(await viewerFor(t.db, user.id, NOW), { now: NOW });

    expect(stats.plan).toBe("standard");
    expect(stats.advanced).toBeNull();
    expect(stats.basic).toMatchObject({
      activeSubscribers: 1,
      grossThisMonthRappen: 990,
      netThisMonthRappen: 841,
      postCount: 0,
      pendingPostCount: 0,
    });
  });

  it("leerer Creator: Nullen und trotzdem 90 Tage", async () => {
    const { user } = await createCreator(t.db);
    await makePremium(t.db, user.id, { now: NOW });

    const stats = await getStudioStats(await viewerFor(t.db, user.id, NOW), { now: NOW });

    expect(stats.basic).toMatchObject({ activeSubscribers: 0, netThisMonthRappen: 0, grossThisMonthRappen: 0 });
    expect(stats.advanced).toMatchObject({ mrrRappen: 0, churnRate30d: 0 });
    expect(stats.advanced!.daily).toHaveLength(90);
    expect(stats.advanced!.daily.every((p) => p.netRappen === 0 && p.newSubs === 0 && p.canceledSubs === 0)).toBe(
      true,
    );
  });

  it("'diesen Monat' ist der Zürcher Kalendermonat (am 1.12. um 00:45 Zürich zählt der November nicht mehr)", async () => {
    const { user: creator } = await createCreator(t.db);
    await insertFanPayment(t.db, { creatorId: creator.id, createdAt: d("2026-11-05T10:00:00Z") });
    await insertFanPayment(t.db, { creatorId: creator.id, createdAt: d("2026-11-30T22:59:00Z") }); // 30.11. 23:59 Zürich
    await insertFanPayment(t.db, { creatorId: creator.id, createdAt: d("2026-11-30T23:30:00Z") }); // 1.12. 00:30 Zürich
    const viewer = await viewerFor(t.db, creator.id, NOW);

    const december = await getStudioStats(viewer, { now: d("2026-11-30T23:45:00Z") });
    expect(december.basic).toMatchObject({ grossThisMonthRappen: 990, netThisMonthRappen: 841 });

    const november = await getStudioStats(viewer, { now: d("2026-11-30T22:59:30Z") });
    expect(november.basic).toMatchObject({ grossThisMonthRappen: 1980, netThisMonthRappen: 1682 });

    // Sommerzeit: 1.7. 00:30 Zürich = 30.6. 22:30 UTC gehört zum Juli
    await insertFanPayment(t.db, { creatorId: creator.id, createdAt: d("2027-06-30T22:30:00Z") });
    const july = await getStudioStats(viewer, { now: d("2027-06-30T23:00:00Z") });
    expect(july.basic.grossThisMonthRappen).toBe(990);
  });

  it("nur für Creator", async () => {
    const fan = await viewerFor(t.db, (await createUser(t.db)).id, NOW);
    await expect(getStudioStats(fan, { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("countApprovedPosts / countActiveSubscribers", () => {
  it("liefern dieselben Zahlen wie die Basis-Statistik – ohne den Rest zu berechnen", async () => {
    const { viewer } = await premiumFixture();
    const stats = await getStudioStats(viewer, { now: NOW });

    expect(await countApprovedPosts(viewer)).toBe(stats.basic.postCount);
    expect(await countActiveSubscribers(viewer, { now: NOW })).toBe(stats.basic.activeSubscribers);
    expect(await countActiveSubscribers(viewer, { now: d("2026-12-05T00:00:00Z") })).toBe(0);
  });

  it("nur für Creator", async () => {
    const fan = await viewerFor(t.db, (await createUser(t.db)).id, NOW);
    await expect(countApprovedPosts(fan)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(countActiveSubscribers(fan)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

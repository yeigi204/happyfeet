import { describe, expect, it } from "vitest";

import { getAdminDashboard } from "@/server/services/admin/dashboard";

import { setupTestDb } from "../../helpers/db";
import { createAdmin, createCreator, createPost, createUser, viewerFor } from "../../helpers/factories";
import {
  daysAfter,
  daysBefore,
  insertAudit,
  insertFanSubscription,
  insertPayout,
  insertPremiumPlan,
  insertReport,
} from "../../helpers/task9";

const t = setupTestDb();
/** Mittwoch, 04.11.2026, 10:00 UTC */
const NOW = new Date("2026-11-04T10:00:00Z");

/**
 * Kleines, von Hand nachgerechnetes Fixture (Standard-Einstellungen: 15 % / 5 %, Premium 19.00):
 *
 * - A: Standard-Creator, Preis 10.00 · B: Premium-Creator (seit NOW-10d), Preis 24.00
 * - s1: f1→A aktiv, Zahlungen NOW-45d und NOW-15d (je 150 Provision)
 * - s2: f2→B aktiv, Zahlung NOW-5d (Premium: 120 Provision, 2280 netto)
 * - s3: f3→A gekündigt NOW-2d, Zugriff bis NOW+10d, Zahlung NOW-20d (150)
 * - s4: f4→B abgelaufen, Zahlung NOW-70d (B damals Standard: 360), gekündigt NOW-50d, Ende NOW-40d
 * - Premium-Plan B: Zahlung NOW-10d (1900 Plattform)
 */
async function fixture() {
  const adminUser = await createAdmin(t.db, { handle: "chefin", displayName: "Mara Keller" });
  const admin = await viewerFor(t.db, adminUser.id, NOW);
  const { user: a } = await createCreator(t.db, {
    user: { handle: "creator_a", displayName: "Anna" },
    profile: { monthlyPriceRappen: 1000 },
  });
  const { user: b } = await createCreator(t.db, {
    user: { handle: "creator_b", displayName: "Bea" },
    profile: { monthlyPriceRappen: 2400 },
  });
  const { user: pending } = await createCreator(t.db, {
    user: { handle: "creator_p" },
    profile: {
      verificationStatus: "pending",
      verifiedAt: null,
      appliedAt: daysBefore(NOW, 2),
      createdAt: daysBefore(NOW, 2),
      updatedAt: daysBefore(NOW, 2),
    },
  });
  await createCreator(t.db, { user: { handle: "creator_r" }, profile: { verificationStatus: "rejected" } });
  const [f1, f2, f3, f4] = await Promise.all(
    ["fan_1", "fan_2", "fan_3", "fan_4"].map((handle) => createUser(t.db, { handle })),
  );

  await insertPremiumPlan(t.db, {
    creatorId: b.id,
    currentPeriodStart: daysBefore(NOW, 10),
    currentPeriodEnd: daysAfter(NOW, 20),
    paidAt: [daysBefore(NOW, 10)],
  });

  await insertFanSubscription(t.db, {
    fanId: f1.id,
    creatorId: a.id,
    priceRappen: 1000,
    status: "active",
    currentPeriodEnd: daysAfter(NOW, 15),
    payments: [
      { at: daysBefore(NOW, 45), plan: "standard" },
      { at: daysBefore(NOW, 15), plan: "standard" },
    ],
  });
  await insertFanSubscription(t.db, {
    fanId: f2.id,
    creatorId: b.id,
    priceRappen: 2400,
    status: "active",
    currentPeriodEnd: daysAfter(NOW, 25),
    payments: [{ at: daysBefore(NOW, 5), plan: "premium" }],
  });
  await insertFanSubscription(t.db, {
    fanId: f3.id,
    creatorId: a.id,
    priceRappen: 1000,
    status: "canceled",
    cancelAtPeriodEnd: true,
    canceledAt: daysBefore(NOW, 2),
    currentPeriodEnd: daysAfter(NOW, 10),
    payments: [{ at: daysBefore(NOW, 20), plan: "standard" }],
  });
  await insertFanSubscription(t.db, {
    fanId: f4.id,
    creatorId: b.id,
    priceRappen: 2400,
    status: "expired",
    cancelAtPeriodEnd: true,
    canceledAt: daysBefore(NOW, 50),
    currentPeriodEnd: daysBefore(NOW, 40),
    payments: [{ at: daysBefore(NOW, 70), plan: "standard" }],
  });

  // Warteschlangen
  await createPost(t.db, a.id, { moderationStatus: "pending", publishedAt: null, createdAt: daysBefore(NOW, 3) });
  await createPost(t.db, a.id, {
    moderationStatus: "pending",
    publishedAt: null,
    createdAt: daysBefore(NOW, 9),
    deletedAt: daysBefore(NOW, 8),
  });
  const reported = await createPost(t.db, b.id);
  await insertReport(t.db, { postId: reported.id, reporterId: f1.id, reason: "possible_minor", createdAt: daysBefore(NOW, 1) });
  await insertReport(t.db, { postId: reported.id, reporterId: f2.id, reason: "spam", createdAt: daysBefore(NOW, 4) });
  await insertReport(t.db, {
    postId: reported.id,
    reporterId: f3.id,
    reason: "non_consensual",
    status: "dismissed",
    createdAt: daysBefore(NOW, 6),
  });
  await insertPayout(t.db, { creatorId: a.id, amountRappen: 500 });
  await insertPayout(t.db, { creatorId: b.id, amountRappen: 700, schedule: "weekly" });
  await insertPayout(t.db, {
    creatorId: a.id,
    amountRappen: 300,
    status: "paid",
    periodStart: new Date("2026-09-01T00:00:00Z"),
    periodEnd: new Date("2026-10-01T00:00:00Z"),
  });

  // 13 Audit-Einträge → Feed zeigt die neuesten 12
  for (let i = 0; i < 13; i++) {
    await insertAudit(t.db, {
      actorId: i === 0 ? null : adminUser.id,
      action: i === 12 ? "user.banned" : "post.approved",
      createdAt: daysBefore(NOW, (13 - i) / 10),
    });
  }

  return { admin, adminUser, a, b, pending };
}

describe("getAdminDashboard", () => {
  it("berechnet die KPIs", async () => {
    const { admin } = await fixture();

    const { kpis } = await getAdminDashboard(admin, { now: NOW });

    expect(kpis).toEqual({
      mrrRappen: 3400, // s1 + s2 (s3 kündigt)
      mrrDeltaPct: 240, // vor 30 Tagen: nur s1 (1000)
      platformMrrRappen: 150 + 120 + 1900,
      platformRevenue30dRappen: 150 + 120 + 150 + 1900,
      platformRevenueDeltaPct: 1446.7, // Vorperiode: 150
      grossVolume30dRappen: 1000 + 2400 + 1000 + 1900,
      activeSubscriptions: 3,
      activeSubscriptionsDelta30d: 2,
      creatorsApproved: 2,
      creatorsPending: 1,
      creatorsPremium: 1,
      fans: 4,
      premiumSharePct: 50,
    });
  });

  it("liefert 90 lückenlose UTC-Tage (aufsteigend, bis heute) für Umsatz und Abos", async () => {
    const { admin } = await fixture();

    const { revenueDaily, subscriptionsDaily } = await getAdminDashboard(admin, { now: NOW });

    expect(revenueDaily).toHaveLength(90);
    expect(subscriptionsDaily).toHaveLength(90);
    expect(revenueDaily[0].date).toBe("2026-08-07");
    expect(revenueDaily[89].date).toBe("2026-11-04");
    for (let i = 1; i < 90; i++) {
      const prev = Date.parse(`${revenueDaily[i - 1].date}T00:00:00Z`);
      expect(Date.parse(`${revenueDaily[i].date}T00:00:00Z`) - prev).toBe(24 * 60 * 60 * 1000);
      expect(subscriptionsDaily[i].date).toBe(revenueDaily[i].date);
    }

    const byDate = new Map(revenueDaily.map((d) => [d.date, d]));
    expect(byDate.get("2026-10-25")).toEqual({ date: "2026-10-25", platformFeeRappen: 1900, creatorNetRappen: 0 });
    expect(byDate.get("2026-10-30")).toEqual({ date: "2026-10-30", platformFeeRappen: 120, creatorNetRappen: 2280 });
    expect(byDate.get("2026-10-31")).toEqual({ date: "2026-10-31", platformFeeRappen: 0, creatorNetRappen: 0 });
    expect(revenueDaily.reduce((sum, d) => sum + d.platformFeeRappen, 0)).toBe(150 + 150 + 120 + 150 + 1900 + 360);

    const subs = new Map(subscriptionsDaily.map((d) => [d.date, d]));
    expect(subs.get("2026-10-30")).toMatchObject({ newSubs: 1, canceledSubs: 0 });
    expect(subs.get("2026-11-02")).toMatchObject({ newSubs: 0, canceledSubs: 1 });
    expect(subs.get("2026-10-05")?.active).toBe(1);
    expect(subs.get("2026-08-26")).toMatchObject({ newSubs: 1, active: 1 }); // s4 startet NOW-70d
    expect(subscriptionsDaily[89]).toMatchObject({ date: "2026-11-04", active: 3 });
    expect(subscriptionsDaily.reduce((sum, d) => sum + d.newSubs, 0)).toBe(4);
    expect(subscriptionsDaily.reduce((sum, d) => sum + d.canceledSubs, 0)).toBe(2);
  });

  it("liefert Provisions-Mix, Warteschlangen, Top-Creator und Aktivität", async () => {
    const { admin, adminUser, a, b } = await fixture();

    const dashboard = await getAdminDashboard(admin, { now: NOW });

    expect(dashboard.feeMix30d).toEqual({ standardFeesRappen: 300, premiumFeesRappen: 120, premiumPlansRappen: 1900 });
    expect(dashboard.queues).toEqual({
      verifications: { count: 1, oldestAt: daysBefore(NOW, 2) },
      premoderation: { count: 1, oldestAt: daysBefore(NOW, 3) },
      reports: { count: 2, criticalCount: 1, oldestAt: daysBefore(NOW, 4) },
      payoutsScheduled: { count: 2, totalRappen: 1200 },
    });
    expect(dashboard.topCreators).toEqual([
      {
        userId: b.id,
        handle: "creator_b",
        displayName: "Bea",
        isPremium: true,
        activeSubscribers: 1,
        gross30dRappen: 2400,
        net30dRappen: 2280,
      },
      {
        userId: a.id,
        handle: "creator_a",
        displayName: "Anna",
        isPremium: false,
        activeSubscribers: 2,
        gross30dRappen: 2000,
        net30dRappen: 1700,
      },
    ]);
    expect(dashboard.activity).toHaveLength(12);
    expect(dashboard.activity[0]).toMatchObject({
      action: "user.banned",
      actor: { id: adminUser.id, handle: "chefin", displayName: "Mara Keller" },
    });
    // der älteste (System-)Eintrag fällt heraus
    expect(dashboard.activity.every((item) => item.actor !== null)).toBe(true);
  });

  it("liefert auf leerer Datenbank Nullen statt Fehlern", async () => {
    const admin = await viewerFor(t.db, (await createAdmin(t.db)).id, NOW);

    const dashboard = await getAdminDashboard(admin, { now: NOW });

    expect(dashboard.kpis).toMatchObject({
      mrrRappen: 0,
      mrrDeltaPct: null,
      platformRevenueDeltaPct: null,
      activeSubscriptions: 0,
      premiumSharePct: 0,
      fans: 0,
    });
    expect(dashboard.revenueDaily).toHaveLength(90);
    expect(dashboard.revenueDaily.every((d) => d.platformFeeRappen === 0 && d.creatorNetRappen === 0)).toBe(true);
    expect(dashboard.queues.verifications).toEqual({ count: 0, oldestAt: null });
    expect(dashboard.topCreators).toEqual([]);
  });
});

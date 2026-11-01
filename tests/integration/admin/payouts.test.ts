import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { auditLog, payouts, users } from "@/server/db/schema";
import type { Viewer } from "@/lib/domain/types";
import { AuthError, ForbiddenError, ValidationError } from "@/server/errors";
import * as adminPayouts from "@/server/services/admin/payouts";
import { generateDuePayouts, listPayouts, markPayoutPaid } from "@/server/services/admin/payouts";
import * as payoutService from "@/server/services/payouts";

import { setupTestDb } from "../../helpers/db";
import { createAdmin, createCreator, createUser, makePremium, viewerFor } from "../../helpers/factories";
import { insertFanPayment } from "../../helpers/task8";

const t = setupTestDb();
const NOW = new Date("2026-11-04T10:00:00Z");

async function fixture() {
  const { user: std } = await createCreator(t.db, { user: { handle: "std_anna", displayName: "Anna" } });
  const { user: prem } = await createCreator(t.db, { user: { handle: "prem_bea", displayName: "Bea" } });
  await makePremium(t.db, prem.id, { now: NOW });
  await insertFanPayment(t.db, { creatorId: std.id, createdAt: new Date("2026-10-10T10:00:00Z") });
  await insertFanPayment(t.db, { creatorId: prem.id, plan: "premium", createdAt: new Date("2026-10-29T10:00:00Z") });
  const admin = await viewerFor(t.db, (await createAdmin(t.db)).id, NOW);
  await generateDuePayouts(admin, { now: NOW });
  return { std, prem, admin };
}

describe("listPayouts", () => {
  it("liefert Auszahlungen mit Creator-Daten und Premium-Status", async () => {
    const { std, prem, admin } = await fixture();

    const rows = await listPayouts(admin, undefined, { now: NOW });

    expect(rows).toHaveLength(2);
    const byCreator = new Map(rows.map((r) => [r.creator.userId, r]));
    expect(byCreator.get(std.id)).toMatchObject({
      creator: { userId: std.id, handle: "std_anna", displayName: "Anna", isPremium: false },
      amountRappen: 841,
      schedule: "monthly",
      status: "scheduled",
      paidAt: null,
    });
    expect(byCreator.get(prem.id)).toMatchObject({
      creator: { handle: "prem_bea", isPremium: true },
      amountRappen: 940,
      schedule: "weekly",
    });
    const row = byCreator.get(std.id)!;
    expect(row.periodStart).toBeInstanceOf(Date);
    expect(row.periodEnd).toEqual(new Date("2026-11-01T00:00:00Z"));
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("filtert nach Status", async () => {
    const { std, admin } = await fixture();
    const [stdPayout] = await t.db.select().from(payouts).where(eq(payouts.creatorId, std.id));
    await markPayoutPaid(admin, stdPayout.id, { now: NOW });

    const paid = await listPayouts(admin, { status: "paid" });
    expect(paid.map((r) => r.id)).toEqual([stdPayout.id]);
    expect(paid[0].paidAt).toEqual(NOW);
    expect(await listPayouts(admin, { status: "scheduled" })).toHaveLength(1);
    expect(await listPayouts(admin, { status: "failed" })).toEqual([]);
    await expect(
      listPayouts(admin, { status: "bogus" as unknown as "paid" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("re-exportiert markPayoutPaid aus dem Payout-Service", () => {
    expect(adminPayouts.markPayoutPaid).toBe(payoutService.markPayoutPaid);
  });

  it("generateDuePayouts delegiert an den Payout-Service (Audit mit Admin als Akteur)", async () => {
    const { std, admin } = await fixture();
    await insertFanPayment(t.db, { creatorId: std.id, createdAt: new Date("2026-11-10T10:00:00Z") });

    expect(await generateDuePayouts(admin, { now: new Date("2026-12-02T10:00:00Z") })).toEqual({
      created: 1,
      totalRappen: 841,
    });
    const entries = await t.db.select().from(auditLog).where(eq(auditLog.action, "payouts.generated"));
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.actorId === admin.id)).toBe(true);
  });
});

describe("Admin-Autorisierung", () => {
  it("Nicht-Admins (auch gesperrte Admins) werden abgewiesen", async () => {
    const { admin } = await fixture();
    const [payout] = await t.db.select().from(payouts);
    const fan = await viewerFor(t.db, (await createUser(t.db)).id, NOW);
    const { user: creatorUser } = await createCreator(t.db);
    const creator = await viewerFor(t.db, creatorUser.id, NOW);
    await t.db.update(users).set({ status: "banned" }).where(eq(users.id, admin.id));
    const bannedAdmin = await viewerFor(t.db, admin.id, NOW);

    for (const viewer of [fan, creator, bannedAdmin]) {
      await expect(listPayouts(viewer)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(generateDuePayouts(viewer, { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(markPayoutPaid(viewer, payout.id, { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect((await t.db.select().from(payouts)).every((p) => p.status === "scheduled")).toBe(true);
  });

  it("generateDuePayouts der Admin-Services kennt keinen System-Akteur (null → AuthError)", async () => {
    await insertFanPayment(t.db, { creatorId: (await createCreator(t.db)).user.id, createdAt: new Date("2026-10-10T10:00:00Z") });

    await expect(generateDuePayouts(null as unknown as Viewer, { now: NOW })).rejects.toBeInstanceOf(AuthError);
    expect(await t.db.select().from(payouts)).toHaveLength(0);
  });
});

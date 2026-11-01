import { describe, expect, it } from "vitest";

import { listAuditLog } from "@/server/services/admin/audit";

import { setupTestDb } from "../../helpers/db";
import { createAdmin, createUser, viewerFor } from "../../helpers/factories";
import { daysBefore, insertAudit } from "../../helpers/task9";

const t = setupTestDb();
const NOW = new Date("2026-11-04T10:00:00Z");

async function fixture() {
  const adminUser = await createAdmin(t.db, { handle: "chefin", displayName: "Mara Keller" });
  const admin = await viewerFor(t.db, adminUser.id, NOW);
  const fan = await createUser(t.db, { handle: "fan_frieda", displayName: "Frieda" });
  await insertAudit(t.db, { actorId: adminUser.id, action: "creator.approved", createdAt: daysBefore(NOW, 3), targetType: "creator", targetId: fan.id });
  await insertAudit(t.db, { actorId: null, action: "payouts.generated", createdAt: daysBefore(NOW, 2) });
  await insertAudit(t.db, { actorId: fan.id, action: "subscription.activated", createdAt: daysBefore(NOW, 1) });
  await insertAudit(t.db, { actorId: adminUser.id, action: "user.banned", createdAt: daysBefore(NOW, 0.5) });
  return { admin, adminUser, fan };
}

describe("listAuditLog", () => {
  it("liefert Einträge neueste zuerst mit Akteur", async () => {
    const { admin, adminUser, fan } = await fixture();

    const items = await listAuditLog(admin);

    expect(items.map((i) => i.action)).toEqual([
      "user.banned",
      "subscription.activated",
      "payouts.generated",
      "creator.approved",
    ]);
    expect(items[0].actor).toEqual({ id: adminUser.id, handle: "chefin", displayName: "Mara Keller" });
    expect(items[2].actor).toBeNull();
    expect(items[3]).toMatchObject({ targetType: "creator", targetId: fan.id, metadata: {} });
    expect(items[3].createdAt).toEqual(daysBefore(NOW, 3));
  });

  it("unterstützt limit, before und action", async () => {
    const { admin } = await fixture();

    expect((await listAuditLog(admin, { limit: 2 })).map((i) => i.action)).toEqual([
      "user.banned",
      "subscription.activated",
    ]);
    expect((await listAuditLog(admin, { before: daysBefore(NOW, 1) })).map((i) => i.action)).toEqual([
      "payouts.generated",
      "creator.approved",
    ]);
    expect((await listAuditLog(admin, { action: "payouts.generated" })).map((i) => i.action)).toEqual([
      "payouts.generated",
    ]);
  });

  it("begrenzt das Limit (1–200)", async () => {
    const { admin } = await fixture();
    expect(await listAuditLog(admin, { limit: 0 })).toHaveLength(4);
    expect(await listAuditLog(admin, { limit: 10_000 })).toHaveLength(4);
  });
});

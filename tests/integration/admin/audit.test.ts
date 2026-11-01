import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { auditLog } from "@/server/db/schema";
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

describe("listAuditLog – Ziel-Handles und Cursor", () => {
  it("löst Nutzer-/Creator-Ziele und die Creator-ID aus den Metadaten zu Handles auf", async () => {
    const { admin, fan } = await fixture();
    const creator = await createUser(t.db, { handle: "zehenspiel", displayName: "Nina" });
    await t.db.insert(auditLog).values({
      actorId: fan.id,
      action: "subscription.activated",
      targetType: "subscription",
      targetId: "6c1f2a9e-4b3d-4f5a-9c2e-1d7b8a0e3f41",
      metadata: { creatorId: creator.id },
      createdAt: NOW,
    });
    await t.db.insert(auditLog).values({
      actorId: null,
      action: "settings.updated",
      targetType: "settings",
      targetId: "1",
      metadata: { creatorId: "keine-uuid" },
      createdAt: new Date(NOW.getTime() + 1000),
    });

    const items = await listAuditLog(admin);

    expect(items[0]).toMatchObject({ target: null, creator: null });
    expect(items[1]).toMatchObject({
      target: null,
      creator: { id: creator.id, handle: "zehenspiel", displayName: "Nina" },
    });
    const approved = items.find((i) => i.action === "creator.approved")!;
    expect(approved.target).toEqual({ id: fan.id, handle: "fan_frieda", displayName: "Frieda" });
  });

  it("blättert mit einem stabilen Cursor (created_at, id) – auch bei identischen und Mikrosekunden-Zeitstempeln", async () => {
    const adminUser = await createAdmin(t.db);
    const admin = await viewerFor(t.db, adminUser.id, NOW);
    // 7 Einträge in derselben Millisekunde (unterschiedliche Mikrosekunden) plus 3 identische Zeitstempel
    for (let i = 0; i < 7; i++) {
      await t.db.execute(
        sql`insert into ${auditLog} (action, created_at) values (${`same_ms_${i}`}, '2026-11-04 10:00:00.123'::timestamptz + ${i} * interval '1 microsecond')`,
      );
    }
    for (let i = 0; i < 3; i++) {
      await t.db.execute(sql`insert into ${auditLog} (action, created_at) values (${`same_ts_${i}`}, '2026-11-04 09:00:00'::timestamptz)`);
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const items = await listAuditLog(admin, { limit: 3, cursor });
      if (items.length === 0) break;
      seen.push(...items.map((i) => i.id));
      cursor = items.at(-1)!.cursor;
    }
    expect(seen).toHaveLength(10);
    expect(new Set(seen).size).toBe(10);
    const all = await listAuditLog(admin, { limit: 200 });
    expect(seen).toEqual(all.map((i) => i.id));
  });

  it("ein ungültiger Cursor wird ignoriert (erste Seite), before funktioniert weiter", async () => {
    const { admin } = await fixture();
    expect(await listAuditLog(admin, { cursor: "kaputt" })).toHaveLength(4);
    expect(await listAuditLog(admin, { cursor: "1_'; drop table audit_log; --" })).toHaveLength(4);
    expect((await listAuditLog(admin, { before: daysBefore(NOW, 1) })).map((i) => i.action)).toEqual([
      "payouts.generated",
      "creator.approved",
    ]);
  });
});

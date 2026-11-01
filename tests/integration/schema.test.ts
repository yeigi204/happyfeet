import { describe, expect, it } from "vitest";

import { getPlatformSettings } from "@/server/services/settings";
import { writeAudit } from "@/server/services/audit";
import { auditLog, payments } from "@/server/db/schema";
import { setupTestDb } from "../helpers/db";
import { createActiveSubscription, createCreator, createUser, viewerFor, makePremium } from "../helpers/factories";

const t = setupTestDb();

describe("Schema & Fundament", () => {
  it("liefert Standard-Einstellungen aus der Migration", async () => {
    const s = await getPlatformSettings();
    expect(s).toMatchObject({ standardFeeBps: 1500, premiumFeeBps: 500, premoderationCount: 5 });
  });

  it("erzwingt, dass Gebühr + Netto = Brutto", async () => {
    const { user: creator } = await createCreator(t.db);
    const fan = await createUser(t.db);
    await expect(
      t.db.insert(payments).values({
        kind: "fan_subscription",
        payerId: fan.id,
        creatorId: creator.id,
        grossRappen: 1000,
        feeBps: 1500,
        platformFeeRappen: 150,
        creatorNetRappen: 800,
        provider: "mock",
        providerPaymentId: "pay_1",
      }),
    ).rejects.toThrow();
  });

  it("erlaubt nur ein lebendes Abo pro Fan & Creator", async () => {
    const { user: creator } = await createCreator(t.db);
    const fan = await createUser(t.db);
    await createActiveSubscription(t.db, fan.id, creator.id);
    await expect(createActiveSubscription(t.db, fan.id, creator.id)).rejects.toThrow();
  });

  it("baut Viewer inkl. Premium-Status", async () => {
    const { user } = await createCreator(t.db);
    expect((await viewerFor(t.db, user.id)).creator).toEqual({ verificationStatus: "approved", isPremium: false });
    await makePremium(t.db, user.id);
    expect((await viewerFor(t.db, user.id)).creator?.isPremium).toBe(true);
  });

  it("schreibt Audit-Einträge", async () => {
    const admin = await createUser(t.db, { isAdmin: true });
    await writeAudit({ actorId: admin.id, action: "settings.updated", targetType: "settings", metadata: { a: 1 } });
    const rows = await t.db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toEqual({ a: 1 });
  });
});

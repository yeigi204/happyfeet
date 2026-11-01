import { describe, expect, it } from "vitest";

import type { PlatformSettings } from "@/lib/domain/types";
import { auditLog, platformSettings } from "@/server/db/schema";
import { ValidationError } from "@/server/errors";
import { updatePlatformSettings } from "@/server/services/admin/settings";
import { getPlatformSettings } from "@/server/services/settings";

import { setupTestDb } from "../../helpers/db";
import { createAdmin, viewerFor } from "../../helpers/factories";

const t = setupTestDb();
const NOW = new Date("2026-11-04T10:00:00Z");

type Input = Partial<Omit<PlatformSettings, "updatedAt">>;

async function adminViewer() {
  return viewerFor(t.db, (await createAdmin(t.db)).id, NOW);
}

async function expectInvalid(input: Input, field: string) {
  const admin = await adminViewer();
  const error = await updatePlatformSettings(admin, input, { now: NOW }).catch((e: unknown) => e);
  expect(error, JSON.stringify(input)).toBeInstanceOf(ValidationError);
  expect(Object.keys((error as ValidationError).fieldErrors), JSON.stringify(input)).toContain(field);
}

describe("updatePlatformSettings", () => {
  it("speichert gültige Werte, liefert die neuen Einstellungen und schreibt Audit mit before/after", async () => {
    const admin = await adminViewer();

    const result = await updatePlatformSettings(
      admin,
      { standardFeeBps: 1800, premiumPriceRappen: 2490, minPriceRappen: 590 },
      { now: NOW },
    );

    expect(result).toMatchObject({
      standardFeeBps: 1800,
      premiumFeeBps: 500,
      premiumPriceRappen: 2490,
      minPriceRappen: 590,
      maxPriceRappen: 4990,
      premoderationCount: 5,
    });
    expect(result.updatedAt).toEqual(NOW);
    expect(await getPlatformSettings(t.db)).toMatchObject({ standardFeeBps: 1800, minPriceRappen: 590 });
    const [row] = await t.db.select().from(platformSettings);
    expect(row.updatedBy).toBe(admin.id);

    const audit = await t.db.select().from(auditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "settings.updated", actorId: admin.id, targetType: "settings" });
    expect(audit[0].metadata).toMatchObject({
      before: { standardFeeBps: 1500, premiumPriceRappen: 1900, minPriceRappen: 490 },
      after: { standardFeeBps: 1800, premiumPriceRappen: 2490, minPriceRappen: 590 },
    });
  });

  it("validiert Sätze (ganzzahlig, 0–5000 bps)", async () => {
    await expectInvalid({ standardFeeBps: 5001 }, "standardFeeBps");
    await expectInvalid({ premiumFeeBps: -1 }, "premiumFeeBps");
    await expectInvalid({ standardFeeBps: 12.5 }, "standardFeeBps");
  });

  it("validiert Premium-Preis und Vorab-Prüfung", async () => {
    await expectInvalid({ premiumPriceRappen: 99 }, "premiumPriceRappen");
    await expectInvalid({ premiumPriceRappen: 100_001 }, "premiumPriceRappen");
    await expectInvalid({ premoderationCount: 51 }, "premoderationCount");
    await expectInvalid({ premoderationCount: -1 }, "premoderationCount");
  });

  it("validiert den Preisrahmen (10er-Schritte, 100 ≤ min ≤ max – auch gegen gespeicherte Werte)", async () => {
    await expectInvalid({ minPriceRappen: 495 }, "minPriceRappen");
    await expectInvalid({ maxPriceRappen: 4995 }, "maxPriceRappen");
    await expectInvalid({ minPriceRappen: 90 }, "minPriceRappen");
    await expectInvalid({ minPriceRappen: 3000, maxPriceRappen: 2000 }, "minPriceRappen");
    // max bleibt 4990 → min 5000 ist zu gross
    await expectInvalid({ minPriceRappen: 5000 }, "minPriceRappen");
    expect(await t.db.select().from(auditLog)).toHaveLength(0);
    expect(await getPlatformSettings(t.db)).toMatchObject({ minPriceRappen: 490, maxPriceRappen: 4990 });
  });

  it("lehnt unbekannte Felder ab", async () => {
    const admin = await adminViewer();
    await expect(
      updatePlatformSettings(admin, { updatedAt: new Date() } as unknown as Input, { now: NOW }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("min = max ist erlaubt", async () => {
    const admin = await adminViewer();
    const result = await updatePlatformSettings(admin, { minPriceRappen: 990, maxPriceRappen: 990 }, { now: NOW });
    expect(result).toMatchObject({ minPriceRappen: 990, maxPriceRappen: 990 });
  });
});

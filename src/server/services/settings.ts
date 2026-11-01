import "server-only";

import { eq } from "drizzle-orm";

import { DEFAULT_PLATFORM_SETTINGS, type PlatformSettings } from "@/lib/domain/types";
import { getDb, type DbOrTx } from "@/server/db/client";
import { platformSettings } from "@/server/db/schema";

/** Liest die Plattform-Einstellungen (legt die Standard-Zeile bei Bedarf an). */
export async function getPlatformSettings(db: DbOrTx = getDb()): Promise<PlatformSettings> {
  const rows = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
  let row = rows[0];
  if (!row) {
    await db.insert(platformSettings).values({ id: 1, ...DEFAULT_PLATFORM_SETTINGS }).onConflictDoNothing();
    [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
  }
  return {
    standardFeeBps: row.standardFeeBps,
    premiumFeeBps: row.premiumFeeBps,
    premiumPriceRappen: row.premiumPriceRappen,
    minPriceRappen: row.minPriceRappen,
    maxPriceRappen: row.maxPriceRappen,
    premoderationCount: row.premoderationCount,
    updatedAt: row.updatedAt,
  };
}

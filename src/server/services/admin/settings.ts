import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import type { PlatformSettings, Viewer } from "@/lib/domain/types";
import { assertAdmin } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { platformSettings } from "@/server/db/schema";
import { ValidationError, zodFieldErrors } from "@/server/errors";
import { writeAudit } from "@/server/services/audit";
import { getPlatformSettings } from "@/server/services/settings";

type SettingsValues = Omit<PlatformSettings, "updatedAt">;
type SettingsKey = keyof SettingsValues;

const SETTINGS_KEYS: readonly SettingsKey[] = [
  "standardFeeBps",
  "premiumFeeBps",
  "premiumPriceRappen",
  "minPriceRappen",
  "maxPriceRappen",
  "premoderationCount",
];

const PRICE_STEP_RAPPEN = 10;
const MIN_PRICE_FLOOR_RAPPEN = 100;

function intIn(min: number, max: number, message: string) {
  return z.number({ error: message }).int(message).min(min, message).max(max, message);
}

const feeBps = intIn(0, 5000, "Der Satz muss eine ganze Zahl zwischen 0 und 5000 bps (0–50 %) sein.");
const priceBound = intIn(
  MIN_PRICE_FLOOR_RAPPEN,
  1_000_000,
  `Der Betrag muss mindestens ${MIN_PRICE_FLOOR_RAPPEN} Rappen sein.`,
).refine((v) => v % PRICE_STEP_RAPPEN === 0, `Bitte in ${PRICE_STEP_RAPPEN}-Rappen-Schritten angeben.`);

const patchSchema = z.strictObject(
  {
    standardFeeBps: feeBps.optional(),
    premiumFeeBps: feeBps.optional(),
    premiumPriceRappen: intIn(100, 100_000, "Der Premium-Preis muss zwischen 1 und 1000 Franken liegen.").optional(),
    minPriceRappen: priceBound.optional(),
    maxPriceRappen: priceBound.optional(),
    premoderationCount: intIn(0, 50, "Die Vorab-Prüfung muss zwischen 0 und 50 Posts liegen.").optional(),
  },
  { error: "Unbekanntes Feld." },
);

function values(s: PlatformSettings): SettingsValues {
  return Object.fromEntries(SETTINGS_KEYS.map((key) => [key, s[key]])) as SettingsValues;
}

/**
 * Ändert die Plattform-Einstellungen (nur die übergebenen Felder).
 * Validierung: Sätze ganzzahlig 0–5000 bps; Premium-Preis 100–100’000 Rp.; Preisrahmen in 10er-Schritten
 * mit 100 ≤ min ≤ max (geprüft gegen die zusammengeführten Werte); Vorab-Prüfung 0–50.
 * Schreibt `settings.updated` mit `before`/`after`; ohne tatsächliche Änderung passiert nichts.
 */
export async function updatePlatformSettings(
  admin: Viewer,
  input: Partial<SettingsValues>,
  opts: { now?: Date } = {},
): Promise<PlatformSettings> {
  assertAdmin(admin);
  const now = opts.now ?? new Date();

  const parsed = patchSchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new ValidationError("Bitte prüfe die Einstellungen.", zodFieldErrors(parsed.error.issues));
  }
  const patch = parsed.data;

  return getDb().transaction(async (tx) => {
    // Zeile anlegen (falls nötig) und sperren, damit zwei gleichzeitige Änderungen den min/max-Abgleich
    // nicht aushebeln; danach mit Sperre frisch lesen.
    await getPlatformSettings(tx);
    await tx.select({ id: platformSettings.id }).from(platformSettings).where(eq(platformSettings.id, 1)).for("update");
    const current = await getPlatformSettings(tx);
    const before = values(current);
    const after: SettingsValues = { ...before };
    for (const key of SETTINGS_KEYS) {
      const value = patch[key];
      if (value !== undefined) after[key] = value;
    }

    if (after.minPriceRappen > after.maxPriceRappen) {
      const message = "Der Mindestpreis darf nicht über dem Höchstpreis liegen.";
      throw new ValidationError("Bitte prüfe die Einstellungen.", {
        minPriceRappen: [message],
        maxPriceRappen: [message],
      });
    }

    const changed = SETTINGS_KEYS.filter((key) => after[key] !== before[key]);
    if (changed.length === 0) return current;

    const [row] = await tx
      .update(platformSettings)
      .set({ ...after, updatedAt: now, updatedBy: admin.id })
      .where(eq(platformSettings.id, 1))
      .returning();

    await writeAudit(
      {
        actorId: admin.id,
        action: "settings.updated",
        targetType: "settings",
        targetId: "1",
        metadata: { before, after, changed },
      },
      tx,
    );

    return { ...values(row), updatedAt: row.updatedAt };
  });
}

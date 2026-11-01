import { formatChf } from "../format";
import type { PlatformSettings } from "./types";

const PRICE_STEP_RAPPEN = 10;

export function validateMonthlyPrice(
  rappen: number,
  s: Pick<PlatformSettings, "minPriceRappen" | "maxPriceRappen">,
): { ok: true } | { ok: false; reason: string } {
  if (!Number.isSafeInteger(rappen) || rappen < 0) {
    return { ok: false, reason: "Bitte gib einen gültigen Preis ein." };
  }
  if (rappen < s.minPriceRappen || rappen > s.maxPriceRappen) {
    return {
      ok: false,
      reason: `Der Preis muss zwischen ${formatChf(s.minPriceRappen)} und ${formatChf(s.maxPriceRappen)} liegen.`,
    };
  }
  if (rappen % PRICE_STEP_RAPPEN !== 0) {
    return { ok: false, reason: `Der Preis muss in ${PRICE_STEP_RAPPEN}-Rappen-Schritten angegeben werden.` };
  }
  return { ok: true };
}

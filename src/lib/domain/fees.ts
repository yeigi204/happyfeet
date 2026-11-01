import type { CreatorPlan, PlatformSettings } from "./types";

const FULL_BPS = 10_000;

export function feeBpsForPlan(
  plan: CreatorPlan,
  s: Pick<PlatformSettings, "standardFeeBps" | "premiumFeeBps">,
): number {
  return plan === "premium" ? s.premiumFeeBps : s.standardFeeBps;
}

/**
 * Teilt einen Bruttobetrag in Plattform-Provision und Creator-Anteil.
 * Die Provision wird kaufmännisch auf ganze Rappen gerundet; beide Teile ergeben immer exakt den Bruttobetrag.
 */
export function splitPayment(
  grossRappen: number,
  feeBps: number,
): { platformFeeRappen: number; creatorNetRappen: number } {
  if (!Number.isSafeInteger(grossRappen) || grossRappen < 0) {
    throw new RangeError(`grossRappen must be a non-negative integer, got ${grossRappen}`);
  }
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > FULL_BPS) {
    throw new RangeError(`feeBps must be an integer between 0 and ${FULL_BPS}, got ${feeBps}`);
  }
  const platformFeeRappen = Math.round((grossRappen * feeBps) / FULL_BPS);
  return { platformFeeRappen, creatorNetRappen: grossRappen - platformFeeRappen };
}

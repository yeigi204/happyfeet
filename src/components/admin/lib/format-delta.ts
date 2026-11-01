import { formatNumber, formatPercent } from "@/lib/format";

export type DeltaDirection = "up" | "down" | "flat";

/** Richtung einer Veränderung (0 = unverändert). */
export function directionOf(value: number): DeltaDirection {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

/**
 * Prozentpunkte aus dem Dashboard (`12.5` = 12.5 %) mit Vorzeichen: „+12.5 %“, „-3.0 %“, „0.0 %“.
 * `null` (keine Vergleichsbasis) → `null`, damit die UI das Delta weglassen kann.
 */
export function formatSignedPercentPoints(pct: number | null): string | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  const text = formatPercent(pct / 100);
  return pct > 0 ? `+${text}` : text;
}

/** Ganzzahlige Veränderung mit Vorzeichen: „+704“, „-12“, „0“. */
export function formatSignedNumber(n: number): string {
  const text = formatNumber(n);
  return n > 0 ? `+${text}` : text;
}

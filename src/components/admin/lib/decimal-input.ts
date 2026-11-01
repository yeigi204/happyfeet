/**
 * Eingaben in Franken bzw. Prozent ↔ Integer in Rappen bzw. Basispunkten.
 * Akzeptiert „9.90“, „9,90“, „ 12 “, „1’234.50“ / „1'234.50“ (Schweizer Tausender-Apostroph),
 * höchstens zwei Nachkommastellen – es wird nie still gerundet.
 */

export type DecimalParse = { ok: true; hundredths: number } | { ok: false; reason: string };

const PATTERN = /^-?\d+(?:[.,]\d{1,2})?$/;

/** Dezimalzahl → ganzzahlige Hundertstel (Rappen bzw. bps). */
export function parseHundredths(raw: unknown): DecimalParse {
  const text = typeof raw === "string" ? raw.trim().replace(/[’'\s]/g, "") : "";
  if (text === "") return { ok: false, reason: "Bitte gib einen Wert ein." };
  if (!PATTERN.test(text)) {
    return /[.,]\d{3,}$/.test(text)
      ? { ok: false, reason: "Höchstens zwei Nachkommastellen." }
      : { ok: false, reason: "Bitte gib eine Zahl ein, z. B. 9.90." };
  }
  const [whole, fraction = ""] = text.replace(",", ".").split(".");
  const negative = whole.startsWith("-");
  const units = Math.abs(Number(whole)) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(units)) return { ok: false, reason: "Der Wert ist zu gross." };
  return { ok: true, hundredths: negative ? -units : units };
}

/** Ganze Zahl (z. B. Anzahl Posts). */
export function parseWholeNumber(raw: unknown): { ok: true; value: number } | { ok: false; reason: string } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") return { ok: false, reason: "Bitte gib einen Wert ein." };
  if (!/^\d+$/.test(text)) return { ok: false, reason: "Bitte gib eine ganze Zahl ein." };
  const value = Number(text);
  return Number.isSafeInteger(value) ? { ok: true, value } : { ok: false, reason: "Der Wert ist zu gross." };
}

/** Rappen bzw. bps → Eingabetext mit zwei (Franken) bzw. bis zu zwei (Prozent) Nachkommastellen. */
export function hundredthsToInput(value: number, mode: "chf" | "percent"): string {
  if (!Number.isFinite(value)) return "";
  const fixed = (value / 100).toFixed(2);
  return mode === "chf" ? fixed : fixed.replace(/\.?0+$/, "");
}

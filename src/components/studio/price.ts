/**
 * Preis-Eingaben im Studio (Formularfeld in Franken ↔ Rappen). Rein, läuft in Client und Server Action.
 * Nur das Format wird hier geprüft – Rahmen und 10-Rappen-Schritte prüft der Service verbindlich.
 */

const PRICE_PATTERN = /^\d{1,5}(?:\.\d{1,2})?$/;

/**
 * „9.90“, „9,90“, „CHF 12.–“, „Fr. 12“, „1’490“ → Rappen (Integer). Ungültig oder leer → `null`.
 * Rechnet ohne Fliesskomma, damit „9.90“ exakt 990 ergibt.
 */
export function parseChfInput(input: string): number | null {
  if (typeof input !== "string") return null;
  const cleaned = input
    .trim()
    .replace(/^(?:chf|fr\.?)/i, "")
    .replace(/(?:chf|fr\.?)$/i, "")
    .replace(/[\s'’ ]/g, "")
    .replace(",", ".")
    .replace(/\.[-–—]$/, "");
  if (!PRICE_PATTERN.test(cleaned)) return null;
  const [francs, cents = ""] = cleaned.split(".");
  return Number(francs) * 100 + Number(cents.padEnd(2, "0"));
}

/** Rappen → Formularwert „9.90“ (ohne Währung und Tausendertrennzeichen – zum Bearbeiten, nicht zur Anzeige). */
export function rappenToChfInput(rappen: number): string {
  if (!Number.isSafeInteger(rappen) || rappen < 0) return "";
  const francs = Math.floor(rappen / 100);
  const cents = String(rappen % 100).padStart(2, "0");
  return `${francs}.${cents}`;
}

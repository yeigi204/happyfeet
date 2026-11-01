/**
 * Gemeinsame Chart-Typen. Farben sind Rollen (Token `--color-series-N`), nie Hex-Werte:
 * die Werte wechseln zwischen heller Welt und `.theme-admin` automatisch.
 * Reihenfolge der Slots ist fix (validiert auf CVD-Abstand) – Serien nie zyklisch einfärben.
 */

export type SeriesColor = "series-1" | "series-2" | "series-3" | "series-4";

export type SeriesDef = { key: string; label: string; color: SeriesColor };

/** Eine Zeile pro Tag. Weitere Spalten sind Serienwerte (Zahlen); `date` im Format YYYY-MM-DD. */
export type DatumRow = { date: string /* YYYY-MM-DD */ } & Record<string, number | string>;

/**
 * Wertformat:
 * - `chf`: Werte in **Rappen** (Integer), Anzeige via `formatChf`.
 * - `number`: Anzahl.
 * - `percent`: Verhältnis 0–1 (0.25 → „25 %“).
 */
export type ValueFormat = "chf" | "number" | "percent";

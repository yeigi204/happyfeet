/**
 * Reine Chart-Mathematik (Skalen, Ticks, Pfade, Formate) – keine React-Abhängigkeit,
 * damit Server- und Client-Charts identisch rechnen und alles unit-testbar bleibt.
 */
import { formatChf, formatNumber, formatPercent } from "@/lib/format";

import type { DatumRow, SeriesColor, ValueFormat } from "./types";

const NBSP = " ";
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"] as const;
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;
const NICE_STEPS = [1, 2, 2.5, 5, 10] as const;

/**
 * Runde Achsenwerte, die [min, max] abdecken (Domain = erster bis letzter Tick).
 * `integer`: nur ganze Schritte (Anzahlen – kein „2.5 Abos“).
 */
export function niceTicks(min: number, max: number, target = 4, integer = false): number[] {
  const lo = Math.min(min, 0);
  const hi = Math.max(max, 0);
  if (hi - lo <= 0) return [0, 1];

  const raw = (hi - lo) / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const fits = (s: number) => s >= normalized && (!integer || Number.isInteger(s * magnitude));
  const step = Math.max(integer ? 1 : 0, (NICE_STEPS.find(fits) ?? 10) * magnitude);

  const first = Math.floor(lo / step + 1e-9) * step;
  const last = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = first; v <= last + step / 2; v += step) {
    // Gleitkomma-Rauschen glätten (0.30000000000000004 → 0.3) und -0 vermeiden
    const tick = Number((Math.round(v / step) * step).toPrecision(12));
    ticks.push(tick === 0 ? 0 : tick);
  }
  return ticks;
}

export function linearScale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0;
  if (span === 0) return () => (r0 + r1) / 2;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

function parseDay(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** „3. Nov“ – eigene Monatsnamen statt Intl, damit Server und Browser gleich rendern. */
export function formatDayShort(date: string): string {
  const d = parseDay(date);
  return `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`;
}

/** „Di, 3. Nov 2026“ */
export function formatDayLong(date: string): string {
  const d = parseDay(date);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function thin(indices: number[], maxTicks: number): number[] {
  if (indices.length <= maxTicks) return indices;
  const every = Math.ceil(indices.length / maxTicks);
  return indices.filter((_, i) => i % every === 0);
}

/** Indizes für X-Achsen-Beschriftungen: Monatsanfänge (lange Spannen), Montage (mittlere), sonst gleichmässig. */
export function pickDateTicks(dates: string[], maxTicks: number): number[] {
  const n = dates.length;
  if (n <= maxTicks) return dates.map((_, i) => i);

  const parsed = dates.map(parseDay);
  if (n >= 56) {
    const monthStarts = parsed.flatMap((d, i) => (d.getUTCDate() === 1 ? [i] : []));
    if (monthStarts.length >= 2) return thin(monthStarts, maxTicks);
  }
  if (n >= 14) {
    const mondays = parsed.flatMap((d, i) => (d.getUTCDay() === 1 ? [i] : []));
    if (mondays.length >= 2) return thin(mondays, maxTicks);
  }
  const step = Math.ceil((n - 1) / (maxTicks - 1));
  const out: number[] = [];
  for (let i = 0; i < n; i += step) out.push(i);
  return out;
}

function millions(v: number): string {
  return `${formatNumber(Math.round(v / 100_000) / 10)}${NBSP}Mio.`;
}

/**
 * Kompakte Achsenbeschriftung (Einheit steht im Titel): CHF in Franken ohne Rappen-Nullen
 * („1’200“, bei kleinen Skalen „2.5“), ab 1 Mio. „2.5 Mio.“
 */
export function formatAxisValue(value: number, format: ValueFormat): string {
  switch (format) {
    case "chf": {
      const francs = value / 100;
      // Auf Rappen runden, nicht auf Franken: ein 2.5er-Tick darf nicht als „3“ erscheinen.
      return Math.abs(francs) >= 1_000_000 ? millions(francs) : formatNumber(Math.round(francs * 100) / 100);
    }
    case "number":
      return Math.abs(value) >= 1_000_000 ? millions(value) : formatNumber(value);
    case "percent":
      return formatPercent(value, 0);
  }
}

/** Exakter Wert für Tooltip und Tabelle. */
export function formatChartValue(value: number, format: ValueFormat): string {
  switch (format) {
    case "chf":
      return formatChf(value);
    case "number":
      return formatNumber(value);
    case "percent":
      return formatPercent(value, 1);
  }
}

export function numericValue(row: DatumRow, key: string): number {
  const v = row[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export type StackedSeries = { key: string; y0: number[]; y1: number[] };

export function stackSeries(data: DatumRow[], keys: string[], stacked: boolean): StackedSeries[] {
  const base = data.map(() => 0);
  return keys.map((key) => {
    const y0 = stacked ? [...base] : data.map(() => 0);
    const y1 = data.map((row, i) => y0[i] + numericValue(row, key));
    if (stacked) y1.forEach((v, i) => (base[i] = v));
    return { key, y0, y1 };
  });
}

/** Datenindex unter der X-Position. `point`: Punkte an den Rändern (Linie/Fläche); `band`: Bänder (Balken). */
export function nearestIndex(x: number, count: number, plotWidth: number, mode: "point" | "band"): number {
  if (count <= 1) return 0;
  const raw = mode === "point" ? Math.round(x / (plotWidth / (count - 1))) : Math.floor(x / (plotWidth / count));
  return Math.min(count - 1, Math.max(0, raw));
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function linePath(xs: number[], ys: number[]): string {
  return xs.map((x, i) => `${i === 0 ? "M" : "L"}${r2(x)},${r2(ys[i])}`).join("");
}

/** Geschlossenes Band: obere Kante vorwärts, untere Kante rückwärts. */
export function areaPath(xs: number[], y0s: number[], y1s: number[]): string {
  if (xs.length === 0) return "";
  const top = linePath(xs, y1s);
  const bottom = xs
    .map((_, i) => xs.length - 1 - i)
    .map((i) => `L${r2(xs[i])},${r2(y0s[i])}`)
    .join("");
  return `${top}${bottom}Z`;
}

/**
 * Balken mit 4px gerundetem Datenende, eckig an der Basislinie.
 * `yEnd < yBase` → nach oben, sonst nach unten. Höhe 0 zeichnet nichts.
 */
export function barPath(x: number, width: number, yBase: number, yEnd: number, radius: number): string {
  const h = Math.abs(yBase - yEnd);
  if (h <= 0 || width <= 0) return "";
  const r = r2(Math.min(radius, width / 2, h));
  const [x0, x1, b, e] = [r2(x), r2(x + width), r2(yBase), r2(yEnd)];
  if (yEnd < yBase) {
    return `M${x0},${b}V${r2(e + r)}A${r},${r} 0 0 1 ${r2(x0 + r)},${e}H${r2(x1 - r)}A${r},${r} 0 0 1 ${x1},${r2(e + r)}V${b}Z`;
  }
  return `M${x0},${b}V${r2(e - r)}A${r},${r} 0 0 0 ${r2(x0 + r)},${e}H${r2(x1 - r)}A${r},${r} 0 0 0 ${x1},${r2(e - r)}V${b}Z`;
}

/** Würden Endbeschriftungen kollidieren? Dann keine Direktlabels (Legende + Tooltip tragen die Identität). */
export function labelsCollide(ys: number[], minGap: number): boolean {
  const sorted = [...ys].sort((a, b) => a - b);
  return sorted.some((y, i) => i > 0 && y - sorted[i - 1] < minGap);
}

export function seriesColorVar(color: SeriesColor): string {
  return `var(--color-${color})`;
}

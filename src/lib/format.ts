/**
 * Anzeige-Formatierung für die Schweiz (de-CH, CHF, Europe/Zurich).
 *
 * Läuft in Server- und Client-Komponenten. Damit Server (Node/ICU) und Browser exakt dieselben
 * Zeichen rendern (sonst Hydration-Fehler), werden ICU-abhängige Details fixiert:
 * Tausendertrennzeichen immer U+2019 „’“, Minus immer „-“, geschützte Leerzeichen (U+00A0)
 * vor „%“ und nach „CHF“, Datum/Zeit aus Einzelteilen zusammengesetzt.
 */

const LOCALE = "de-CH";
const TIME_ZONE = "Europe/Zurich";
const NBSP = " ";
const GROUP_SEPARATOR = "’";
const MISSING = "–";

const numberFormats = new Map<string, Intl.NumberFormat>();

function decimal(value: number, minFractionDigits: number, maxFractionDigits: number): string {
  if (!Number.isFinite(value)) return MISSING;
  const key = `${minFractionDigits}:${maxFractionDigits}`;
  let nf = numberFormats.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: minFractionDigits,
      maximumFractionDigits: maxFractionDigits,
      signDisplay: "negative",
    });
    numberFormats.set(key, nf);
  }
  return nf
    .formatToParts(value)
    .map((part) => {
      if (part.type === "group") return GROUP_SEPARATOR;
      if (part.type === "minusSign") return "-";
      return part.value;
    })
    .join("");
}

function withUnit(formatted: string, render: (n: string) => string): string {
  return formatted === MISSING ? MISSING : render(formatted);
}

/** Rappen → „CHF 1’234.50“; `compact` rundet auf ganze Franken („CHF 1’235“). */
export function formatChf(rappen: number, opts?: { compact?: boolean }): string {
  const digits = opts?.compact ? 0 : 2;
  return withUnit(decimal(rappen / 100, digits, digits), (n) => `CHF${NBSP}${n}`);
}

/** „1’234’567“ (max. 3 Nachkommastellen). */
export function formatNumber(n: number): string {
  return decimal(n, 0, 3);
}

/** Basispunkte → „15 %“, „12.5 %“, „1.25 %“. */
export function formatPercentBps(bps: number): string {
  return withUnit(decimal(bps / 100, 0, 2), (n) => `${n}${NBSP}%`);
}

/** Verhältnis → Prozent mit fester Anzahl Nachkommastellen: 0.1234 → „12.3 %“. */
export function formatPercent(ratio: number, digits = 1): string {
  return withUnit(decimal(ratio * 100, digits, digits), (n) => `${n}${NBSP}%`);
}

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function zurichParts(d: Date): Record<"year" | "month" | "day" | "hour" | "minute", string> | null {
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(dateTimeFormat.formatToParts(d).map((p) => [p.type, p.value]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute };
}

/** „01.11.2026“ (Kalenderdatum in Europe/Zurich). */
export function formatDate(d: Date): string {
  const p = zurichParts(d);
  return p ? `${p.day}.${p.month}.${p.year}` : MISSING;
}

/** „01.11.2026, 14:05“ (Europe/Zurich, 24 h). */
export function formatDateTime(d: Date): string {
  const p = zurichParts(d);
  return p ? `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute}` : MISSING;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELATIVE_DAYS_LIMIT = 7;

/** „gerade eben“, „vor 5 Min.“, „vor 3 Std.“, „vor 2 Tagen“ – ab 7 Tagen (und für die Zukunft) das Datum; ungültig → „–“. */
export function formatRelative(d: Date, now: Date): string {
  const diff = now.getTime() - d.getTime();
  if (Number.isNaN(diff)) return MISSING;
  if (diff < MINUTE_MS && diff > -MINUTE_MS) return "gerade eben";
  if (diff < 0) return formatDate(d);
  if (diff < HOUR_MS) return `vor ${Math.floor(diff / MINUTE_MS)} Min.`;
  if (diff < DAY_MS) return `vor ${Math.floor(diff / HOUR_MS)} Std.`;
  const days = Math.floor(diff / DAY_MS);
  if (days >= RELATIVE_DAYS_LIMIT) return formatDate(d);
  return days === 1 ? "vor 1 Tag" : `vor ${days} Tagen`;
}

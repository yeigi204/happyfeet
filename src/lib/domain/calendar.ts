/**
 * Kalendergrenzen in Europe/Zurich (rein, ohne I/O). Für Anzeigen wie „diesen Monat“, die der Nutzer
 * in Schweizer Ortszeit liest. Auszahlungsperioden bleiben bewusst in UTC (siehe payouts.ts).
 */

const TIME_ZONE = "Europe/Zurich";

const wallClockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function zurichWallClock(at: Date): WallClock {
  const parts = Object.fromEntries(wallClockFormat.formatToParts(at).map((p) => [p.type, Number(p.value)]));
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Abstand der Zürcher Ortszeit zu UTC (ms) zum Zeitpunkt `at` – +1 h (MEZ) oder +2 h (MESZ). */
function zurichOffsetMs(at: Date): number {
  const w = zurichWallClock(at);
  const wallAsUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return wallAsUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Zeitpunkt von 00:00 Uhr Zürcher Zeit am 1. des Monats (`month` 1–12, Überlauf erlaubt). */
function zurichStartOfMonth(year: number, month: number): Date {
  const utcMidnight = Date.UTC(year, month - 1, 1);
  const candidate = utcMidnight - zurichOffsetMs(new Date(utcMidnight));
  // Offset am Ergebnis nochmals bestimmen (Umstellungen liegen in Zürich nie auf einem Monatsersten 00:00).
  return new Date(utcMidnight - zurichOffsetMs(new Date(candidate)));
}

/** Der Zürcher Kalendermonat, in dem `now` liegt: `[start, end)`. */
export function zurichMonthBounds(now: Date): { start: Date; end: Date } {
  const { year, month } = zurichWallClock(now);
  return { start: zurichStartOfMonth(year, month), end: zurichStartOfMonth(year, month + 1) };
}

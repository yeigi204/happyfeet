import { describe, expect, it } from "vitest";
import {
  formatChf,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatPercentBps,
  formatRelative,
} from "./format";

/**
 * Exact characters are pinned on purpose:
 * - NBSP = U+00A0 (no line break between "CHF" and the amount, or between number and "%")
 * - APOS = U+2019 (Swiss thousands separator). Node 22 / ICU 78 emits U+0027 for de-CH while
 *   other engines emit U+2019, so format.ts normalises it – otherwise server and browser
 *   render different strings and React hydration breaks.
 */
const NBSP = " ";
const APOS = "’";

describe("formatChf", () => {
  it.each([
    [123450, `CHF${NBSP}1${APOS}234.50`],
    [0, `CHF${NBSP}0.00`],
    [5, `CHF${NBSP}0.05`],
    [490, `CHF${NBSP}4.90`],
    [1900, `CHF${NBSP}19.00`],
    [99999, `CHF${NBSP}999.99`],
    [123456789, `CHF${NBSP}1${APOS}234${APOS}567.89`],
    [-1230, `CHF${NBSP}-12.30`],
  ])("%i Rappen → %j", (rappen, expected) => {
    expect(formatChf(rappen)).toBe(expected);
  });

  it("does not print a minus sign for negative zero", () => {
    expect(formatChf(-0)).toBe(`CHF${NBSP}0.00`);
  });

  it.each([
    [123400, `CHF${NBSP}1${APOS}234`],
    [123449, `CHF${NBSP}1${APOS}234`],
    [123450, `CHF${NBSP}1${APOS}235`],
    [0, `CHF${NBSP}0`],
    [-250000, `CHF${NBSP}-2${APOS}500`],
  ])("compact: %i Rappen → %j", (rappen, expected) => {
    expect(formatChf(rappen, { compact: true })).toBe(expected);
  });

  it("renders non-finite values as a dash instead of NaN", () => {
    expect(formatChf(Number.NaN)).toBe("–");
    expect(formatChf(Number.POSITIVE_INFINITY, { compact: true })).toBe("–");
  });
});

describe("formatNumber", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1234, `1${APOS}234`],
    [1234567, `1${APOS}234${APOS}567`],
    [1234.5, `1${APOS}234.5`],
    [-1500, `-1${APOS}500`],
  ])("%d → %j", (n, expected) => {
    expect(formatNumber(n)).toBe(expected);
  });

  it("renders NaN as a dash", () => {
    expect(formatNumber(Number.NaN)).toBe("–");
  });
});

describe("formatPercentBps", () => {
  it.each([
    [1500, `15${NBSP}%`],
    [500, `5${NBSP}%`],
    [1250, `12.5${NBSP}%`],
    [125, `1.25${NBSP}%`],
    [0, `0${NBSP}%`],
    [10000, `100${NBSP}%`],
  ])("%i bps → %j", (bps, expected) => {
    expect(formatPercentBps(bps)).toBe(expected);
  });
});

describe("formatPercent", () => {
  it.each([
    [0.1234, undefined, `12.3${NBSP}%`],
    [0.5, undefined, `50.0${NBSP}%`],
    [0.5, 0, `50${NBSP}%`],
    [0.04567, 2, `4.57${NBSP}%`],
    [1.5, 0, `150${NBSP}%`],
    [12.345, 0, `1${APOS}235${NBSP}%`],
    [-0.032, undefined, `-3.2${NBSP}%`],
    [0, undefined, `0.0${NBSP}%`],
  ])("%d with %s digits → %j", (ratio, digits, expected) => {
    expect(formatPercent(ratio, digits)).toBe(expected);
  });

  it("renders a ratio from a division by zero as a dash", () => {
    expect(formatPercent(0 / 0)).toBe("–");
    expect(formatPercent(1 / 0)).toBe("–");
  });
});

describe("formatDate", () => {
  it.each([
    ["2026-11-01T12:00:00Z", "01.11.2026"],
    // already the next day in Zurich (CET, UTC+1)
    ["2026-11-01T23:30:00Z", "02.11.2026"],
    // already the next day in Zurich (CEST, UTC+2)
    ["2026-07-31T22:30:00Z", "01.08.2026"],
    ["2026-07-31T21:30:00Z", "31.07.2026"],
  ])("%s → %j", (input, expected) => {
    expect(formatDate(new Date(input))).toBe(expected);
  });

  it("renders an invalid date as a dash", () => {
    expect(formatDate(new Date("nope"))).toBe("–");
  });
});

describe("formatDateTime", () => {
  it.each([
    ["2026-11-01T23:30:00Z", "02.11.2026, 00:30"],
    ["2026-07-01T10:05:00Z", "01.07.2026, 12:05"],
    ["2026-01-01T23:00:00Z", "02.01.2026, 00:00"],
    ["2026-03-29T00:59:00Z", "29.03.2026, 01:59"],
    ["2026-03-29T01:00:00Z", "29.03.2026, 03:00"],
  ])("%s → %j (Europe/Zurich, 24 h)", (input, expected) => {
    expect(formatDateTime(new Date(input))).toBe(expected);
  });

  it("renders an invalid date as a dash", () => {
    expect(formatDateTime(new Date(Number.NaN))).toBe("–");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const SEC = 1000;
  const MIN = 60 * SEC;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it.each([
    ["0 s", 0, "gerade eben"],
    ["59 s", 59 * SEC, "gerade eben"],
    ["60 s", MIN, "vor 1 Min."],
    ["5 min", 5 * MIN, "vor 5 Min."],
    ["59 min 59 s", HOUR - SEC, "vor 59 Min."],
    ["60 min", HOUR, "vor 1 Std."],
    ["3 h", 3 * HOUR, "vor 3 Std."],
    ["23 h 59 min", DAY - MIN, "vor 23 Std."],
    ["24 h", DAY, "vor 1 Tag"],
    ["2 days", 2 * DAY, "vor 2 Tagen"],
    ["6 days 23 h", 7 * DAY - HOUR, "vor 6 Tagen"],
    ["7 days", 7 * DAY, "25.10.2026"],
    ["90 days", 90 * DAY, "03.08.2026"],
  ])("%s ago → %j", (_label, ms, expected) => {
    expect(formatRelative(ago(ms), now)).toBe(expected);
  });

  it("tolerates small clock skew into the future", () => {
    expect(formatRelative(new Date(now.getTime() + 30 * SEC), now)).toBe("gerade eben");
  });

  it("shows the date for timestamps further in the future", () => {
    expect(formatRelative(new Date(now.getTime() + 2 * HOUR), now)).toBe("01.11.2026");
  });

  it("renders an invalid date (or an invalid now) as a dash instead of „vor NaN Tagen“", () => {
    expect(formatRelative(new Date("nope"), now)).toBe("–");
    expect(formatRelative(now, new Date(Number.NaN))).toBe("–");
  });
});

import { describe, expect, it } from "vitest";

import {
  areaPath,
  barPath,
  formatAxisValue,
  formatChartValue,
  formatDayLong,
  formatDayShort,
  labelsCollide,
  linePath,
  linearScale,
  nearestIndex,
  niceTicks,
  pickDateTicks,
  seriesColorVar,
  stackSeries,
} from "./scale";
import type { DatumRow } from "./types";

const NBSP = " ";

function days(start: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < count; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe("niceTicks", () => {
  it("rounds the domain up to clean steps starting at zero", () => {
    expect(niceTicks(0, 1234)).toEqual([0, 500, 1000, 1500]);
  });

  it("covers negative values for diverging charts", () => {
    expect(niceTicks(-12, 30)).toEqual([-20, 0, 20, 40]);
  });

  it("returns a usable domain when all values are zero", () => {
    expect(niceTicks(0, 0)).toEqual([0, 1]);
  });

  it("uses 2.5 steps where they fit better than 5", () => {
    expect(niceTicks(0, 9)).toEqual([0, 2.5, 5, 7.5, 10]);
  });

  it("keeps ticks whole for counts (no „2.5 Abos“)", () => {
    expect(niceTicks(0, 9, 4, true)).toEqual([0, 5, 10]);
    expect(niceTicks(0, 3, 4, true)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(-2, 1, 4, true)).toEqual([-2, -1, 0, 1]);
    expect(niceTicks(0, 1234, 4, true)).toEqual([0, 500, 1000, 1500]);
  });
});

describe("linearScale", () => {
  it("maps a domain onto an inverted pixel range", () => {
    const y = linearScale(0, 100, 200, 0);
    expect(y(0)).toBe(200);
    expect(y(50)).toBe(100);
    expect(y(100)).toBe(0);
  });

  it("does not divide by zero on a flat domain", () => {
    const y = linearScale(5, 5, 100, 0);
    expect(Number.isFinite(y(5))).toBe(true);
  });
});

describe("date labels", () => {
  it("formats a short German day label without ICU differences", () => {
    expect(formatDayShort("2026-11-03")).toBe("3. Nov");
    expect(formatDayShort("2026-03-01")).toBe("1. Mär");
  });

  it("formats a long label with weekday and year", () => {
    expect(formatDayLong("2026-11-03")).toBe("Di, 3. Nov 2026");
    expect(formatDayLong("2026-11-01")).toBe("So, 1. Nov 2026");
  });
});

describe("pickDateTicks", () => {
  it("labels month starts on a 90-day range", () => {
    const dates = days("2026-08-04", 90); // bis 2026-11-01
    const ticks = pickDateTicks(dates, 6);
    expect(ticks.map((i) => dates[i])).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
  });

  it("labels Mondays on a 30-day range", () => {
    const dates = days("2026-10-03", 30);
    const ticks = pickDateTicks(dates, 6);
    expect(ticks.map((i) => dates[i])).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
  });

  it("returns every index when there is room", () => {
    expect(pickDateTicks(days("2026-10-01", 4), 6)).toEqual([0, 1, 2, 3]);
  });

  it("never returns more ticks than requested", () => {
    const dates = days("2025-01-01", 400);
    expect(pickDateTicks(dates, 5).length).toBeLessThanOrEqual(5);
  });
});

describe("value formats", () => {
  it("formats CHF axis ticks in whole francs with Swiss apostrophes", () => {
    expect(formatAxisValue(0, "chf")).toBe("0");
    expect(formatAxisValue(120000, "chf")).toBe("1’200");
    expect(formatAxisValue(250_000_000, "chf")).toBe(`2.5${NBSP}Mio.`);
  });

  it("never rounds a fractional CHF tick to a wrong label", () => {
    // Kleine Beträge (z. B. neuer Creator, < CHF 10 pro Tag) ergeben 2.5er-Schritte in Franken.
    expect(formatAxisValue(250, "chf")).toBe("2.5");
    expect(formatAxisValue(750, "chf")).toBe("7.5");
    expect(formatAxisValue(1000, "chf")).toBe("10");
  });

  it("formats number and percent axis ticks", () => {
    expect(formatAxisValue(12000, "number")).toBe("12’000");
    expect(formatAxisValue(0.25, "percent")).toBe(`25${NBSP}%`);
  });

  it("formats exact values for tooltips and tables", () => {
    expect(formatChartValue(123450, "chf")).toBe(`CHF${NBSP}1’234.50`);
    expect(formatChartValue(4912, "number")).toBe("4’912");
    expect(formatChartValue(0.3123, "percent")).toBe(`31.2${NBSP}%`);
  });
});

describe("stackSeries", () => {
  const data: DatumRow[] = [
    { date: "2026-11-01", a: 10, b: 5 },
    { date: "2026-11-02", a: 20, b: 0 },
  ];

  it("accumulates values in series order when stacked", () => {
    const [a, b] = stackSeries(data, ["a", "b"], true);
    expect(a).toEqual({ key: "a", y0: [0, 0], y1: [10, 20] });
    expect(b).toEqual({ key: "b", y0: [10, 20], y1: [15, 20] });
  });

  it("keeps every series on the baseline when not stacked", () => {
    const [, b] = stackSeries(data, ["a", "b"], false);
    expect(b).toEqual({ key: "b", y0: [0, 0], y1: [5, 0] });
  });

  it("treats missing or non-numeric values as zero", () => {
    const [a] = stackSeries([{ date: "2026-11-01", a: "x" }], ["a"], true);
    expect(a.y1).toEqual([0]);
  });
});

describe("nearestIndex", () => {
  it("snaps to the nearest point on a point scale", () => {
    expect(nearestIndex(0, 5, 400, "point")).toBe(0);
    expect(nearestIndex(149, 5, 400, "point")).toBe(1);
    expect(nearestIndex(151, 5, 400, "point")).toBe(2);
    expect(nearestIndex(9999, 5, 400, "point")).toBe(4);
    expect(nearestIndex(-20, 5, 400, "point")).toBe(0);
  });

  it("picks the band under the pointer on a band scale", () => {
    expect(nearestIndex(99, 4, 400, "band")).toBe(0);
    expect(nearestIndex(100, 4, 400, "band")).toBe(1);
    expect(nearestIndex(400, 4, 400, "band")).toBe(3);
  });

  it("handles a single datum", () => {
    expect(nearestIndex(200, 1, 400, "point")).toBe(0);
  });
});

describe("paths", () => {
  it("draws a polyline", () => {
    expect(linePath([0, 10, 20], [5, 0, 7.5])).toBe("M0,5L10,0L20,7.5");
  });

  it("draws a closed band between two edges", () => {
    expect(areaPath([0, 10], [10, 10], [4, 2])).toBe("M0,4L10,2L10,10L0,10Z");
  });

  it("rounds only the data end of an upward bar", () => {
    expect(barPath(0, 10, 100, 40, 4)).toBe("M0,100V44A4,4 0 0 1 4,40H6A4,4 0 0 1 10,44V100Z");
  });

  it("rounds the bottom end of a downward bar", () => {
    expect(barPath(0, 10, 100, 160, 4)).toBe("M0,100V156A4,4 0 0 0 4,160H6A4,4 0 0 0 10,156V100Z");
  });

  it("clamps the radius on thin or short bars", () => {
    expect(barPath(0, 4, 100, 99, 4)).toBe("M0,100V100A1,1 0 0 1 1,99H3A1,1 0 0 1 4,100V100Z");
  });

  it("draws nothing for a zero-height bar", () => {
    expect(barPath(0, 10, 100, 100, 4)).toBe("");
  });
});

describe("labelsCollide", () => {
  it("detects end labels that would overlap", () => {
    expect(labelsCollide([10, 80, 20], 14)).toBe(true);
    expect(labelsCollide([10, 80, 40], 14)).toBe(false);
  });
});

describe("seriesColorVar", () => {
  it("references the themed series token", () => {
    expect(seriesColorVar("series-3")).toBe("var(--color-series-3)");
  });
});

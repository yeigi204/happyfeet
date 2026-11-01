import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AreaChart } from "./area-chart";
import { BarChart } from "./bar-chart";
import { ChartLegend } from "./chart-legend";
import { ChartTable } from "./chart-table";
import { Meter } from "./meter";
import { Sparkline } from "./sparkline";
import type { DatumRow, SeriesDef } from "./types";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

const data: DatumRow[] = [
  { date: "2026-10-30", platform: 600, creator: 600 },
  { date: "2026-10-31", platform: 500, creator: 400 },
  { date: "2026-11-01", platform: 300, creator: 200 },
];
const series: SeriesDef[] = [
  { key: "platform", label: "Plattform", color: "series-1" },
  { key: "creator", label: "Creator", color: "series-2" },
];

function pathD(markup: string, key: string): string {
  const m = markup.match(new RegExp(`<path[^>]*data-series="${key}"[^>]*\\sd="([^"]+)"`)) ?? markup.match(new RegExp(`<path[^>]*\\sd="([^"]+)"[^>]*data-series="${key}"`));
  if (!m) throw new Error(`no path for ${key}`);
  return m[1];
}

describe("Sparkline", () => {
  it("is an image with the given label and a line", () => {
    const markup = html(h(Sparkline, { values: [1, 3, 2, 5], label: "MRR, 90 Tage" }));
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="MRR, 90 Tage"');
    expect(markup).toMatch(/<path[^>]*d="M0,/);
  });

  it("survives empty and single-value input", () => {
    expect(() => html(h(Sparkline, { values: [], label: "leer" }))).not.toThrow();
    expect(html(h(Sparkline, { values: [7], label: "eins" }))).toContain('aria-label="eins"');
  });

  it("uses the requested series color", () => {
    expect(html(h(Sparkline, { values: [1, 2], label: "x", color: "series-2" }))).toContain("var(--color-series-2)");
  });

  it("marks the current value with a dot unless the marker is turned off (e.g. in table rows)", () => {
    expect(html(h(Sparkline, { values: [1, 2], label: "x" }))).toContain("data-marker");
    expect(html(h(Sparkline, { values: [1, 2], label: "x", marker: false }))).not.toContain("data-marker");
  });
});

describe("ChartLegend", () => {
  it("lists every series label", () => {
    const markup = html(h(ChartLegend, { series }));
    expect(markup).toContain("Plattform");
    expect(markup).toContain("Creator");
    expect(markup).toContain("var(--color-series-1)");
  });
});

describe("ChartTable", () => {
  it("renders one row per day with formatted values and a total for stacked data", () => {
    const markup = html(h(ChartTable, { data, series, format: "chf", caption: "Umsatz", total: true }));
    expect(markup.match(/<tr/g)).toHaveLength(1 + data.length);
    expect(markup).toContain("So, 1. Nov 2026");
    expect(markup).toContain("CHF 6.00");
    expect(markup).toContain("Total");
    expect(markup).toContain("CHF 12.00");
  });
});

describe("AreaChart", () => {
  it("renders title, legend for two series and a table toggle", () => {
    const markup = html(h(AreaChart, { data, series, format: "chf", title: "Umsatz 90 Tage", stacked: true }));
    expect(markup).toContain("Umsatz 90 Tage");
    expect(markup).toContain("data-legend");
    expect(markup).toContain("Plattform");
    expect(markup).toMatch(/<button[^>]*aria-pressed="false"[^>]*>.*Tabelle/);
  });

  it("omits the legend for a single series", () => {
    const markup = html(h(AreaChart, { data, series: [series[0]], format: "chf", title: "Plattform" }));
    expect(markup).not.toContain("data-legend");
  });

  it("scales the y axis to the stacked total", () => {
    const stacked = html(h(AreaChart, { data, series, format: "chf", title: "t", stacked: true }));
    const overlaid = html(h(AreaChart, { data, series, format: "chf", title: "t" }));
    expect(stacked).toMatch(/>15<\/text>/);
    expect(overlaid).not.toMatch(/>15<\/text>/);
  });

  it("draws one line per series and is keyboard reachable", () => {
    const markup = html(h(AreaChart, { data, series, format: "chf", title: "t" }));
    expect(pathD(markup, "platform")).toMatch(/^M/);
    expect(pathD(markup, "creator")).toMatch(/^M/);
    expect(markup).toContain('tabindex="0"');
  });
});

describe("BarChart", () => {
  const subs: DatumRow[] = [
    { date: "2026-10-31", newSubs: 10, canceled: 4 },
    { date: "2026-11-01", newSubs: 6, canceled: 2 },
  ];
  const subSeries: SeriesDef[] = [
    { key: "newSubs", label: "Neu-Abos", color: "series-2" },
    { key: "canceled", label: "Kündigungen", color: "series-1" },
  ];

  it("draws the second series below the baseline in diverging mode", () => {
    const markup = html(h(BarChart, { data: subs, series: subSeries, mode: "diverging", format: "number", title: "Abos" }));
    const up = pathD(markup, "newSubs").match(/^M([\d.]+),([\d.]+)V([\d.]+)/);
    const down = pathD(markup, "canceled").match(/^M([\d.]+),([\d.]+)V([\d.]+)/);
    expect(up && Number(up[3]) < Number(up[2])).toBe(true);
    expect(down && Number(down[3]) > Number(down[2])).toBe(true);
  });

  it("leaves a 2px surface gap between the upward and the downward bar at the baseline", () => {
    const markup = html(h(BarChart, { data: subs, series: subSeries, mode: "diverging", format: "number", title: "Abos" }));
    const upBase = Number(pathD(markup, "newSubs").match(/^M[\d.]+,([\d.]+)/)?.[1]);
    const downBase = Number(pathD(markup, "canceled").match(/^M[\d.]+,([\d.]+)/)?.[1]);
    expect(downBase - upBase).toBeCloseTo(2, 5);
  });

  it("keeps bars visible when many days share a narrow plot", () => {
    const many: DatumRow[] = Array.from({ length: 200 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 3, 1) + i * 86_400_000).toISOString().slice(0, 10),
      newSubs: 5 + (i % 7),
      canceled: 1 + (i % 3),
    }));
    const markup = html(h(BarChart, { data: many, series: subSeries, mode: "diverging", format: "number", title: "Abos" }));
    const widths = [...markup.matchAll(/data-width="([\d.]+)"/g)].map((m) => Number(m[1]));
    // SSR-Breite 640px → Band ≈ 3px: Balken dürfen nicht zu 1px-Haarlinien schrumpfen
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(1.8);
  });

  it("never puts fractional ticks on a count axis", () => {
    const small: DatumRow[] = [
      { date: "2026-10-31", newSubs: 9, canceled: 0 },
      { date: "2026-11-01", newSubs: 3, canceled: 0 },
    ];
    const markup = html(h(BarChart, { data: small, series: [subSeries[0]], format: "number", title: "Abos", height: 250 }));
    expect(markup).not.toMatch(/>\d+\.\d+<\/text>/);
  });

  it("labels the lower half with absolute values", () => {
    const markup = html(h(BarChart, { data: subs, series: subSeries, mode: "diverging", format: "number", title: "Abos" }));
    expect(markup).not.toMatch(/>-\d/);
  });

  it("caps grouped bars at 24px", () => {
    const markup = html(h(BarChart, { data: subs, series: subSeries, format: "number", title: "Abos", height: 200 }));
    const widths = [...markup.matchAll(/data-width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(widths.length).toBe(4);
    expect(Math.max(...widths)).toBeLessThanOrEqual(24);
  });
});

describe("Meter", () => {
  it("sizes parts by share and draws nothing for zero", () => {
    const markup = html(
      h(Meter, {
        title: "Provisions-Mix",
        format: "chf",
        parts: [
          { label: "Standard", value: 300, color: "series-1" },
          { label: "Premium", value: 100, color: "series-2" },
          { label: "Pläne", value: 0, color: "series-3" },
        ],
      }),
    );
    expect(markup.match(/data-segment/g)).toHaveLength(2);
    expect(markup).toContain("flex-grow:0.75");
    expect(markup).toContain("flex-grow:0.25");
    expect(markup).toContain("Pläne");
    expect(markup).toContain("CHF 4.00");
  });
});

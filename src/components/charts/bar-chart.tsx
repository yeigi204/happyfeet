"use client";

import { useId } from "react";

import { ChartFrame, ChartTooltip, pointerX, unitLabel, useIndexNavigation, XLabels, YGrid, type TooltipRow } from "./chart-frame";
import { ChartLegend } from "./chart-legend";
import { ChartTable } from "./chart-table";
import {
  barPath,
  formatAxisValue,
  formatChartValue,
  formatDayLong,
  linearScale,
  nearestIndex,
  niceTicks,
  numericValue,
  pickDateTicks,
  seriesColorVar,
} from "./scale";
import type { DatumRow, SeriesDef, ValueFormat } from "./types";

export type BarChartProps = {
  data: DatumRow[];
  series: SeriesDef[];
  /** `diverging`: erste Serie nach oben, zweite nach unten (z. B. Neu-Abos vs. Kündigungen). */
  mode?: "grouped" | "diverging";
  format: ValueFormat;
  title: string;
  /** Gesamthöhe inkl. X-Achsen-Band. */
  height?: number;
};

const TOP = 12;
const AXIS_BAND = 28;
const MONO_CHAR = 6.4;
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;

export function BarChart({ data, series, mode = "grouped", format, title, height = 240 }: BarChartProps) {
  const shown = mode === "diverging" ? series.slice(0, 2) : series;
  return (
    <ChartFrame
      title={title}
      unit={unitLabel(format)}
      legend={shown.length >= 2 ? <ChartLegend series={shown} /> : undefined}
      table={<ChartTable data={data} series={shown} format={format} caption={title} />}
    >
      {(width) => <BarPlot data={data} series={shown} mode={mode} format={format} title={title} height={height} width={width} />}
    </ChartFrame>
  );
}

type Bar = { key: string; i: number; x: number; width: number; d: string; color: string };

function BarPlot({ data, series, mode, format, title, height, width }: Required<BarChartProps> & { width: number }) {
  const liveId = useId();
  const n = data.length;
  const nav = useIndexNavigation(n);
  const diverging = mode === "diverging" && series.length === 2;

  const values = series.map((s) => data.map((row) => numericValue(row, s.key)));
  const maxUp = Math.max(0, ...(diverging ? values[0] : values.flat()));
  const maxDown = diverging ? Math.max(0, ...values[1]) : 0;

  const plotH = height - TOP - AXIS_BAND;
  const ticks = niceTicks(-maxDown, maxUp, Math.max(2, Math.round(plotH / 52)), format === "number");
  // Untere Hälfte zeigt Beträge (Kündigungen sind „4“, nicht „-4“).
  const tickLabels = ticks.map((t) => formatAxisValue(Math.abs(t), format));
  const left = Math.ceil(Math.max(...tickLabels.map((l) => l.length)) * MONO_CHAR) + 14;
  const right = 12;
  const plotW = Math.max(1, width - left - right);
  const y = linearScale(ticks[0], ticks[ticks.length - 1], TOP + plotH, TOP);
  const base = y(0);
  const band = n > 0 ? plotW / n : plotW;
  const center = (i: number) => left + band * (i + 0.5);
  // 2px Lücke zwischen Flächen – bei sehr schmalen Bändern (90 Tage auf dem Handy) anteilig kleiner,
  // sonst schrumpfen die Balken zu Haarlinien.
  const gap = Math.min(GAP, band * 0.3);

  const bars: Bar[] = [];
  if (diverging) {
    const w = Math.max(1, Math.min(MAX_BAR, band - gap));
    // Je 1px über/unter der Null-Linie: oben und unten berühren sich nicht.
    const half = GAP / 2;
    data.forEach((_, i) => {
      const x0 = center(i) - w / 2;
      const upEnd = Math.min(base - half, y(values[0][i]));
      const downEnd = Math.max(base + half, y(-values[1][i]));
      bars.push({ key: series[0].key, i, x: x0, width: w, d: barPath(x0, w, base - half, upEnd, RADIUS), color: seriesColorVar(series[0].color) });
      bars.push({ key: series[1].key, i, x: x0, width: w, d: barPath(x0, w, base + half, downEnd, RADIUS), color: seriesColorVar(series[1].color) });
    });
  } else {
    const k = Math.max(1, series.length);
    const w = Math.max(1, Math.min(MAX_BAR, (band * 0.78 - (k - 1) * gap) / k));
    const groupW = k * w + (k - 1) * gap;
    data.forEach((_, i) => {
      series.forEach((s, j) => {
        const x0 = center(i) - groupW / 2 + j * (w + gap);
        bars.push({ key: s.key, i, x: x0, width: w, d: barPath(x0, w, base, y(values[j][i]), RADIUS), color: seriesColorVar(s.color) });
      });
    });
  }

  const dates = data.map((d) => d.date);
  const xTicks = pickDateTicks(dates, Math.max(2, Math.floor(plotW / 90)));
  const active = nav.index;

  let tooltipRows: TooltipRow[] = [];
  if (active !== null) {
    tooltipRows = series.map((s, j) => ({
      key: s.key,
      label: s.label,
      value: formatChartValue(values[j][active], format),
      color: seriesColorVar(s.color),
    }));
    if (diverging) {
      const net = values[0][active] - values[1][active];
      tooltipRows.push({ key: "__net", label: "Saldo", value: `${net > 0 ? "+" : ""}${formatChartValue(net, format)}`, separated: true });
    }
  }
  const liveText = active === null ? "" : `${formatDayLong(dates[active])}: ${tooltipRows.map((r) => `${r.label} ${r.value}`).join(", ")}`;

  return (
    <div
      role="group"
      aria-roledescription="Diagramm"
      aria-label={`${title}. Mit den Pfeiltasten Tageswerte anzeigen.`}
      tabIndex={0}
      onKeyDown={nav.onKeyDown}
      onFocus={nav.onFocus}
      onBlur={nav.onBlur}
      className="relative rounded-control outline-offset-4 select-none"
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden
        className="block touch-pan-y overflow-visible"
        onPointerMove={(e) => n > 0 && nav.setIndex(nearestIndex(pointerX(e, width) - left, n, plotW, "band"))}
        onPointerLeave={() => nav.setIndex(null)}
      >
        {/* Hover-Band hinter den Balken: die ganze Spalte ist Trefferfläche */}
        {active !== null ? <rect x={left + band * active} y={TOP} width={band} height={plotH} fill="var(--color-ink)" fillOpacity={0.06} /> : null}

        <YGrid ticks={ticks} labels={tickLabels} y={y} left={left} right={left + plotW} />
        <XLabels indices={xTicks} dates={dates} x={center} y={height - 8} left={left} right={left + plotW} />

        {n === 0 ? (
          <text x={left + plotW / 2} y={TOP + plotH / 2} textAnchor="middle" className="fill-ink-faint text-xs">
            Noch keine Daten
          </text>
        ) : null}

        {bars.map((b) =>
          b.d ? (
            <path
              key={`${b.key}-${b.i}`}
              data-series={b.key}
              data-width={Math.round(b.width * 100) / 100}
              d={b.d}
              fill={b.color}
              fillOpacity={active === null || active === b.i ? 1 : 0.55}
            />
          ) : null,
        )}

        <rect x={left} y={TOP} width={plotW} height={plotH} fill="transparent" />
      </svg>

      {active !== null ? (
        <ChartTooltip x={center(active)} width={width} top={TOP} heading={formatDayLong(dates[active])} rows={tooltipRows} offset={Math.max(14, band / 2 + 8)} />
      ) : null}
      <p id={liveId} aria-live="polite" className="sr-only">
        {liveText}
      </p>
    </div>
  );
}

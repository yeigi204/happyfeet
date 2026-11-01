"use client";

import { useId } from "react";

import { ChartFrame, ChartTooltip, pointerX, unitLabel, useIndexNavigation, XLabels, YGrid, type TooltipRow } from "./chart-frame";
import { ChartLegend } from "./chart-legend";
import { ChartTable } from "./chart-table";
import {
  areaPath,
  formatAxisValue,
  formatChartValue,
  formatDayLong,
  labelsCollide,
  linePath,
  linearScale,
  nearestIndex,
  niceTicks,
  numericValue,
  pickDateTicks,
  seriesColorVar,
  stackSeries,
} from "./scale";
import type { DatumRow, SeriesDef, ValueFormat } from "./types";

export type AreaChartProps = {
  data: DatumRow[];
  series: SeriesDef[];
  stacked?: boolean;
  format: ValueFormat;
  title: string;
  /** Gesamthöhe inkl. X-Achsen-Band (der Container schneidet nie Beschriftungen ab). */
  height?: number;
};

const TOP = 12;
const AXIS_BAND = 28;
const MONO_CHAR = 6.4;
const SANS_CHAR = 6.3;

export function AreaChart({ data, series, stacked = false, format, title, height = 260 }: AreaChartProps) {
  return (
    <ChartFrame
      title={title}
      unit={unitLabel(format)}
      legend={series.length >= 2 ? <ChartLegend series={series} /> : undefined}
      table={<ChartTable data={data} series={series} format={format} caption={title} total={stacked && series.length > 1} />}
    >
      {(width) => <AreaPlot data={data} series={series} stacked={stacked} format={format} title={title} height={height} width={width} />}
    </ChartFrame>
  );
}

function AreaPlot({ data, series, stacked, format, title, height, width }: Required<AreaChartProps> & { width: number }) {
  const liveId = useId();
  const n = data.length;
  const nav = useIndexNavigation(n);

  const stacks = stackSeries(
    data,
    series.map((s) => s.key),
    stacked,
  );
  const maxY = Math.max(0, ...stacks.flatMap((s) => s.y1));
  const plotH = height - TOP - AXIS_BAND;
  const ticks = niceTicks(0, maxY, Math.max(2, Math.round(plotH / 56)));
  const tickLabels = ticks.map((t) => formatAxisValue(t, format));
  const left = Math.ceil(Math.max(...tickLabels.map((l) => l.length)) * MONO_CHAR) + 14;
  const y = linearScale(ticks[0], ticks[ticks.length - 1], TOP + plotH, TOP);

  // Direktlabels am Ende (Bandmitte bei gestapelt) – nur wenn sie sich nicht berühren.
  const last = n - 1;
  const endYs = stacks.map((s) => (n === 0 ? 0 : stacked ? y((s.y0[last] + s.y1[last]) / 2) : y(s.y1[last])));
  const showEndLabels = n > 1 && series.length >= 2 && series.length <= 4 && width >= 480 && !labelsCollide(endYs, 15);
  const right = showEndLabels ? Math.ceil(Math.max(...series.map((s) => s.label.length)) * SANS_CHAR) + 20 : 12;
  const plotW = Math.max(1, width - left - right);
  const x = (i: number) => left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const xs = data.map((_, i) => x(i));
  const dates = data.map((d) => d.date);
  const xTicks = pickDateTicks(dates, Math.max(2, Math.floor(plotW / 90)));

  const active = nav.index;
  const tooltipRows: TooltipRow[] =
    active === null
      ? []
      : [
          ...(stacked ? [...series].reverse() : series).map((s) => ({
            key: s.key,
            label: s.label,
            value: formatChartValue(numericValue(data[active], s.key), format),
            color: seriesColorVar(s.color),
          })),
          ...(stacked && series.length > 1
            ? [
                {
                  key: "__total",
                  label: "Total",
                  value: formatChartValue(
                    series.reduce((sum, s) => sum + numericValue(data[active], s.key), 0),
                    format,
                  ),
                  separated: true,
                },
              ]
            : []),
        ];
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
        onPointerMove={(e) => n > 0 && nav.setIndex(nearestIndex(pointerX(e, width) - left, n, plotW, "point"))}
        onPointerLeave={() => nav.setIndex(null)}
      >
        <YGrid ticks={ticks} labels={tickLabels} y={y} left={left} right={left + plotW} />
        <XLabels indices={xTicks} dates={dates} x={x} y={height - 8} left={left} right={left + plotW} />

        {n === 0 ? (
          <text x={left + plotW / 2} y={TOP + plotH / 2} textAnchor="middle" className="fill-ink-faint text-xs">
            Noch keine Daten
          </text>
        ) : null}

        {n > 0
          ? stacks.map((s, i) => (
              <path
                key={`area-${s.key}`}
                d={areaPath(xs, s.y0.map(y), s.y1.map(y))}
                fill={seriesColorVar(series[i].color)}
                fillOpacity={stacked ? 0.14 : 0.08}
              />
            ))
          : null}

        {n > 0
          ? stacks.map((s, i) => (
              <path
                key={`line-${s.key}`}
                data-series={s.key}
                d={linePath(xs, s.y1.map(y))}
                fill="none"
                stroke={seriesColorVar(series[i].color)}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))
          : null}

        {/* Endpunkte mit 2px-Ring in Flächenfarbe */}
        {n > 0 && active === null
          ? stacks.map((s, i) => (
              <circle key={`end-${s.key}`} cx={xs[last]} cy={y(s.y1[last])} r={4} fill={seriesColorVar(series[i].color)} stroke="var(--color-surface)" strokeWidth={2} />
            ))
          : null}

        {showEndLabels
          ? series.map((s, i) => (
              <text key={`label-${s.key}`} x={left + plotW + 10} y={endYs[i]} dy="0.32em" className="fill-ink-muted text-[11px] font-medium">
                {s.label}
              </text>
            ))
          : null}

        {active !== null ? (
          <g>
            <line x1={crispX(xs[active])} x2={crispX(xs[active])} y1={TOP} y2={TOP + plotH} stroke="var(--color-ink-faint)" strokeWidth={1} shapeRendering="crispEdges" />
            {stacks.map((s, i) => (
              <circle key={`hover-${s.key}`} cx={xs[active]} cy={y(s.y1[active])} r={4} fill={seriesColorVar(series[i].color)} stroke="var(--color-surface)" strokeWidth={2} />
            ))}
          </g>
        ) : null}

        {/* Trefferfläche: ganze Plotfläche, der Crosshair findet das X */}
        <rect x={left} y={TOP} width={plotW} height={plotH} fill="transparent" />
      </svg>

      {active !== null ? <ChartTooltip x={xs[active]} width={width} top={TOP} heading={formatDayLong(dates[active])} rows={tooltipRows} /> : null}
      <p id={liveId} aria-live="polite" className="sr-only">
        {liveText}
      </p>
    </div>
  );
}

function crispX(v: number) {
  return Math.round(v) + 0.5;
}

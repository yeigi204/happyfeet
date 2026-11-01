"use client";

import { Table2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { cn } from "@/components/ui/cn";

import { formatDayShort } from "./scale";
import type { ValueFormat } from "./types";

/** Breite vor der ersten Messung (SSR). Danach misst ein ResizeObserver die echte Breite. */
export const DEFAULT_CHART_WIDTH = 640;
const MIN_CHART_WIDTH = 240;

export function unitLabel(format: ValueFormat): string | null {
  return format === "chf" ? "in CHF" : format === "percent" ? "in %" : null;
}

export type ChartFrameProps = {
  title: string;
  unit?: string | null;
  legend?: ReactNode;
  table: ReactNode;
  children: (width: number) => ReactNode;
  className?: string;
};

/**
 * Gemeinsamer Rahmen für interaktive Charts: Titel, Einheit, Legende, Tabellen-Umschalter
 * und Breitenmessung (SVG rechnet in echten Pixeln → exakte 2px-Linien und 4px-Radien).
 */
export function ChartFrame({ title, unit, legend, table, children, className }: ChartFrameProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_CHART_WIDTH);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.max(MIN_CHART_WIDTH, Math.round(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <figure aria-labelledby={titleId} className={cn("min-w-0", className)}>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id={titleId} className="text-[13px] leading-5 font-semibold text-ink">
            {title}
            {unit ? <span className="ml-2 font-normal text-ink-faint">{unit}</span> : null}
          </h3>
          {legend ? <div className="mt-1.5">{legend}</div> : null}
        </div>
        <button
          type="button"
          aria-pressed={showTable}
          onClick={() => setShowTable((v) => !v)}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-control border px-2 text-xs transition-colors duration-100",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            showTable ? "border-line-strong bg-surface-2 text-ink" : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
          )}
        >
          <Table2 aria-hidden className="size-3.5" />
          Tabelle
        </button>
      </div>
      <div ref={ref} className="relative min-w-0">
        {showTable ? <div className="max-h-80 overflow-y-auto rounded-control border border-line">{table}</div> : children(width)}
      </div>
    </figure>
  );
}

export type TooltipRow = { key: string; label: string; value: string; color?: string; separated?: boolean };

/**
 * Ein Tooltip, alle Serien: Wert zuerst (kräftig), Name danach; Serien-Schlüssel als kurzer Strich.
 * `offset`: Abstand zur Marke – bei Balken mindestens das halbe Band, damit die aktive Spalte frei bleibt.
 */
export function ChartTooltip({
  x,
  width,
  top,
  heading,
  rows,
  offset = 14,
}: {
  x: number;
  width: number;
  top: number;
  heading: string;
  rows: TooltipRow[];
  offset?: number;
}) {
  const flip = x > width * 0.58;
  const dx = Math.round(offset);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-10 min-w-44 rounded-control border border-line-strong bg-surface px-3 py-2"
      style={{ left: `${(x / width) * 100}%`, top, transform: flip ? `translateX(calc(-100% - ${dx}px))` : `translateX(${dx}px)` }}
    >
      <p className="font-mono text-[11px] whitespace-nowrap text-ink-faint tabular-nums">{heading}</p>
      <ul className="mt-1.5 grid grid-cols-[12px_auto_1fr] items-center gap-x-2 gap-y-1">
        {rows.map((r) => (
          <li key={r.key} className={cn("col-span-3 grid grid-cols-subgrid items-center", r.separated && "mt-0.5 border-t border-line pt-1.5")}>
            {r.color ? <span className="h-0.5 w-3 rounded-full" style={{ background: r.color }} /> : <span />}
            <span className="text-right font-mono text-[13px] font-medium whitespace-nowrap text-ink tabular-nums">{r.value}</span>
            <span className="text-xs whitespace-nowrap text-ink-muted">{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const crisp = (v: number) => Math.round(v) + 0.5;

/** Horizontale Haarlinien + Y-Beschriftung (links, rechtsbündig, Mono). Null-Linie kräftiger. */
export function YGrid({ ticks, labels, y, left, right }: { ticks: number[]; labels: string[]; y: (v: number) => number; left: number; right: number }) {
  return (
    <g>
      {ticks.map((t, i) => (
        <g key={t}>
          <line
            x1={left}
            x2={right}
            y1={crisp(y(t))}
            y2={crisp(y(t))}
            stroke={t === 0 ? "var(--color-line-strong)" : "var(--color-line)"}
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
          <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-faint font-mono text-[10.5px] tabular-nums">
            {labels[i]}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Datumsbeschriftung unten; am Rand bündig statt abgeschnitten. */
export function XLabels({ indices, dates, x, y, left, right }: { indices: number[]; dates: string[]; x: (i: number) => number; y: number; left: number; right: number }) {
  return (
    <g>
      {indices.map((i) => {
        const label = formatDayShort(dates[i]);
        const half = label.length * 3.2;
        const cx = x(i);
        const anchor = cx - half < left - 4 ? "start" : cx + half > right + 4 ? "end" : "middle";
        return (
          <text key={i} x={cx} y={y} textAnchor={anchor} className="fill-ink-faint font-mono text-[10.5px] tabular-nums">
            {label}
          </text>
        );
      })}
    </g>
  );
}

/** Crosshair-/Balken-Index per Zeiger und Tastatur (←/→, Pos1/Ende, Esc). */
export function useIndexNavigation(count: number) {
  const [index, setIndex] = useState<number | null>(null);

  const onKeyDown = (e: KeyboardEvent) => {
    if (count === 0) return;
    const current = index ?? count - 1;
    let next: number | null;
    switch (e.key) {
      case "ArrowLeft":
        next = Math.max(0, current - 1);
        break;
      case "ArrowRight":
        next = Math.min(count - 1, current + 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      case "Escape":
        next = null;
        break;
      default:
        return;
    }
    e.preventDefault();
    setIndex(next);
  };

  return {
    index,
    setIndex,
    onKeyDown,
    onFocus: () => setIndex((i) => i ?? (count > 0 ? count - 1 : null)),
    onBlur: () => setIndex(null),
  };
}

/** Zeigerposition in SVG-Koordinaten (das SVG ist exakt `width` breit, aber sicherheitshalber skaliert). */
export function pointerX(e: PointerEvent<SVGElement>, width: number): number {
  const rect = e.currentTarget.getBoundingClientRect();
  return ((e.clientX - rect.left) * width) / (rect.width || width);
}

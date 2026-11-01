import { cn } from "@/components/ui/cn";

import { areaPath, linePath, seriesColorVar } from "./scale";
import type { SeriesColor } from "./types";

export type SparklineProps = {
  values: number[];
  /** Ohne Farbe: Linie in De-Emphasis-Ton, nur der aktuelle Punkt im Akzent. */
  color?: SeriesColor;
  label: string;
  className?: string;
};

const VB_W = 100;
const VB_H = 32;
const PAD = 3;

/**
 * Reines SVG, server-fähig. Dehnt sich auf die Containerbreite (Höhe via className, Default 32px);
 * Linie bleibt dank non-scaling-stroke 1.5px, der Endpunkt ist HTML und damit immer rund.
 */
export function Sparkline({ values, color, label, className }: SparklineProps) {
  const box = cn("relative block h-8 w-full", className);
  if (values.length === 0) return <span role="img" aria-label={label} className={box} />;

  const series = values.length === 1 ? [values[0], values[0]] : values;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const xs = series.map((_, i) => (i / (series.length - 1)) * VB_W);
  const ys = series.map((v) => PAD + (1 - (v - min) / span) * (VB_H - PAD * 2));
  const stroke = color ? seriesColorVar(color) : "var(--color-ink-faint)";
  const dot = color ? seriesColorVar(color) : "var(--color-accent)";
  const lastY = ys[ys.length - 1];

  return (
    <span role="img" aria-label={label} className={box}>
      <svg aria-hidden viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <path d={areaPath(xs, ys.map(() => VB_H), ys)} fill={stroke} fillOpacity={0.1} />
        <path
          d={linePath(xs, ys)}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        aria-hidden
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
        style={{ left: "100%", top: `${(lastY / VB_H) * 100}%`, background: dot }}
      />
    </span>
  );
}

import { cn } from "@/components/ui/cn";
import { formatPercent } from "@/lib/format";

import { formatChartValue, seriesColorVar } from "./scale";
import type { SeriesColor, ValueFormat } from "./types";

export type MeterPart = { label: string; value: number; color: SeriesColor };

export type MeterProps = { parts: MeterPart[]; format: ValueFormat; title: string; className?: string };

/** Ab diesem Anteil passt die Prozentzahl sicher in den Block; sonst nur Tooltip/Liste. */
const INLINE_LABEL_MIN_SHARE = 0.12;

/**
 * Ein Ganzes, in Teile zerlegt (hoher Segmentbalken, 28px). Server-fähig: Hover/Fokus-Details per CSS.
 * Teile mit 0 zeichnen nichts, bleiben aber in der Aufschlüsselung.
 */
export function Meter({ parts, format, title, className }: MeterProps) {
  const total = parts.reduce((sum, p) => sum + Math.max(0, p.value), 0);
  const withShare = parts.map((p) => ({ ...p, share: total > 0 ? Math.max(0, p.value) / total : 0 }));
  const visible = withShare.filter((p) => p.share > 0);
  const describe = (p: (typeof withShare)[number]) => `${p.label}: ${formatChartValue(p.value, format)} (${formatPercent(p.share, 1)})`;

  return (
    <figure className={cn("min-w-0", className)}>
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        <span className="font-mono text-[13px] text-ink-muted tabular-nums">{formatChartValue(total, format)}</span>
      </figcaption>

      <div role="group" aria-label={`${title}: ${withShare.map(describe).join(", ")}`} className="mt-3 flex h-7 w-full gap-0.5">
        {visible.length === 0 ? <div className="h-full w-full rounded-[4px] bg-surface-2" /> : null}
        {visible.map((p, i) => (
          <div
            key={p.label}
            data-segment
            tabIndex={0}
            aria-label={describe(p)}
            className="group relative h-full min-w-[3px] rounded-[4px] outline-offset-2"
            style={{ flexGrow: p.share, flexBasis: 0, background: seriesColorVar(p.color), color: `var(--color-on-${p.color})` }}
          >
            {p.share >= INLINE_LABEL_MIN_SHARE ? (
              <span aria-hidden className="absolute top-1/2 left-2 -translate-y-1/2 font-mono text-[11px] font-semibold tabular-nums">
                {formatPercent(p.share, 0)}
              </span>
            ) : null}
            <span
              role="tooltip"
              className={cn(
                "pointer-events-none absolute bottom-full z-10 mb-2 hidden rounded-control border border-line-strong bg-surface px-2.5 py-1.5 whitespace-nowrap text-ink",
                "group-hover:block group-focus-visible:block",
                i === visible.length - 1 && visible.length > 1 ? "right-0" : "left-0",
              )}
            >
              <span className="block font-mono text-[13px] font-medium tabular-nums">{formatChartValue(p.value, format)}</span>
              <span className="block text-xs text-ink-muted">
                {p.label} · {formatPercent(p.share, 1)}
              </span>
            </span>
          </div>
        ))}
      </div>

      <ul className="mt-4 grid gap-2">
        {withShare.map((p) => (
          <li key={p.label} className="grid grid-cols-[auto_1fr_auto_3.5rem] items-center gap-2 text-[13px]">
            <span aria-hidden className="size-2.5 rounded-[2px]" style={{ background: seriesColorVar(p.color) }} />
            <span className="truncate text-ink-muted">{p.label}</span>
            <span className="font-mono text-ink tabular-nums">{formatChartValue(p.value, format)}</span>
            <span className="text-right font-mono text-ink-faint tabular-nums">{formatPercent(p.share, 0)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

import { cn } from "@/components/ui/cn";

import { seriesColorVar } from "./scale";
import type { SeriesDef } from "./types";

/**
 * Legende (ab 2 Serien immer vorhanden). Schlüssel spiegelt die Marke: Rechteck für Flächen/Balken,
 * Strich für Linien. Text bleibt in Text-Tokens – nie in der Serienfarbe.
 */
export function ChartLegend({ series, variant = "rect", className }: { series: SeriesDef[]; variant?: "rect" | "line"; className?: string }) {
  return (
    <ul data-legend className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}>
      {series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
          <span
            aria-hidden
            className={variant === "line" ? "h-0.5 w-3.5 rounded-full" : "size-2.5 rounded-[2px]"}
            style={{ background: seriesColorVar(s.color) }}
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

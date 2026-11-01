import type { ReactNode } from "react";

import { cn } from "./cn";

/** Leerer Zustand: gestrichelter Rahmen, Icon-Kachel auf Akzent-zart, ein klarer nächster Schritt. */
export function EmptyState({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-4 rounded-card border-[1.5px] border-dashed border-line-strong px-6 py-6 sm:flex-row sm:items-center", className)}>
      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-control bg-accent-soft">
        {/* Marken-Motiv: fünf Zehen, nur der grosse Zeh lackiert */}
        <svg viewBox="0 0 34 26" className="h-[24px] w-[31px]">
          <ellipse cx="7" cy="15.5" rx="5" ry="6.4" transform="rotate(-8 7 15.5)" fill="var(--color-accent)" />
          <g fill="none" stroke="var(--color-accent-strong)" strokeWidth="1.6">
            <ellipse cx="16" cy="9.4" rx="3" ry="3.4" />
            <ellipse cx="22.4" cy="8.6" rx="2.6" ry="2.9" />
            <ellipse cx="27.6" cy="10.8" rx="2.2" ry="2.5" />
            <ellipse cx="31" cy="15.4" rx="1.8" ry="2" />
          </g>
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-base leading-tight font-bold tracking-[-0.015em] text-ink">{title}</h3>
        {description ? <p className="mt-1 max-w-prose text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

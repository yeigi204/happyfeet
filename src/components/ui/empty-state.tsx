import type { ReactNode } from "react";

import { cn } from "./cn";

/** Leerer Zustand: linksbündig, ruhig, mit einem klaren nächsten Schritt. */
export function EmptyState({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-4 rounded-card border border-line bg-surface px-5 py-6 sm:flex-row sm:items-center", className)}>
      <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-control border border-line-strong">
        {/* Marken-Motiv: fünf Zehen, nur der grosse Zeh lackiert */}
        <svg viewBox="0 0 34 26" className="h-[30px] w-[39px]">
          <ellipse cx="7" cy="15.5" rx="5" ry="6.4" transform="rotate(-8 7 15.5)" fill="var(--color-accent)" />
          <g fill="none" stroke="var(--color-ink-faint)" strokeWidth="1.6">
            <ellipse cx="16" cy="9.4" rx="3" ry="3.4" />
            <ellipse cx="22.4" cy="8.6" rx="2.6" ry="2.9" />
            <ellipse cx="27.6" cy="10.8" rx="2.2" ry="2.5" />
            <ellipse cx="31" cy="15.4" rx="1.8" ry="2" />
          </g>
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-lg leading-tight font-semibold tracking-[-0.02em] text-ink">{title}</h3>
        {description ? <p className="mt-1 max-w-prose text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

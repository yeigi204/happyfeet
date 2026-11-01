import type { ReactNode } from "react";

import { cn } from "./cn";

/** Leerer Zustand: linksbündig, ruhig, mit einem klaren nächsten Schritt. */
export function EmptyState({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-4 rounded-card border border-line bg-surface px-5 py-6 sm:flex-row sm:items-center", className)}>
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-control border border-line-strong">
        {/* Nagel-Glyphe: das Marken-Motiv, hier als Umriss = „nichts lackiert“ */}
        <span className="block h-3.5 w-3 rounded-[50%_50%_42%_42%/62%_62%_38%_38%] border-2 border-accent" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-lg leading-tight font-semibold tracking-[-0.02em] text-ink">{title}</h3>
        {description ? <p className="mt-1 max-w-prose text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

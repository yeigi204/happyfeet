import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";

/**
 * Kennzahlen-Raster mit Haarlinien statt Abständen (wie im Design-System). Die Spaltenzahl muss die
 * Anzahl Kacheln ohne Rest teilen – sonst bleibt eine Linienfläche stehen.
 */
export function StatGrid({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <section aria-label={label} className={cn("grid gap-px overflow-hidden rounded-card border border-line bg-line", className)}>
      {children}
    </section>
  );
}

export function StatCell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-w-0 bg-surface p-4 sm:p-5", className)}>{children}</div>;
}

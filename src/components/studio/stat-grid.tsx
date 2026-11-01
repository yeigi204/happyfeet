import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";

/** Kennzahlen-Raster: einzelne Karten mit Abstand (Rosé). `hero`-Zellen tragen ihre eigene Akzentfläche. */
export function StatGrid({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <section aria-label={label} className={cn("grid gap-3.5", className)}>
      {children}
    </section>
  );
}

export function StatCell({ children, className, hero = false }: { children: ReactNode; className?: string; hero?: boolean }) {
  return (
    <div className={cn("min-w-0", hero ? "[&>*]:h-full" : "rounded-card border border-line bg-surface p-5 shadow-sm", className)}>{children}</div>
  );
}

import type { ReactNode } from "react";

import { cn } from "./cn";

export type CardProps = {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Ohne Innenabstand (Tabellen, Listen, Charts bis an den Rand). */
  flush?: boolean;
};

/** Karte: grosser Radius, Haarlinie, sanfter Schatten (im Dunkelmodus ohne Schatten). Titel ruhig, Inhalt laut. */
export function Card({ title, action, children, className, flush }: CardProps) {
  const hasHeader = Boolean(title || action);
  return (
    <section className={cn("min-w-0 rounded-card border border-line bg-surface shadow-sm", className)}>
      {hasHeader ? (
        <header className="flex min-h-12 items-center justify-between gap-3 px-5 pt-4">
          {title ? <h2 className="text-[15px] font-bold tracking-[-0.01em] text-ink">{title}</h2> : <span />}
          {action ? <div className="flex shrink-0 items-center gap-2 text-[13px] text-ink-muted">{action}</div> : null}
        </header>
      ) : null}
      <div className={flush ? undefined : hasHeader ? "px-5 pt-3 pb-5" : "p-5"}>{children}</div>
    </section>
  );
}

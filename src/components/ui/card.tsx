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

/** Haarlinie statt Schatten. Titel klein und ruhig – der Inhalt ist laut, nicht der Rahmen. */
export function Card({ title, action, children, className, flush }: CardProps) {
  return (
    <section className={cn("min-w-0 rounded-card border border-line bg-surface", className)}>
      {title || action ? (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          {title ? <h2 className="text-[13px] font-semibold tracking-[-0.005em] text-ink">{title}</h2> : <span />}
          {action ? <div className="flex shrink-0 items-center gap-2 text-[13px] text-ink-muted">{action}</div> : null}
        </header>
      ) : null}
      <div className={flush ? undefined : "p-4"}>{children}</div>
    </section>
  );
}

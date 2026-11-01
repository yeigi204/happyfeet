import type { ReactNode } from "react";

import { cn } from "./cn";

export type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Kleine Mono-Zeile über dem Titel, z. B. „ADMIN · SO 01.11.2026“. */
  eyebrow?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, eyebrow, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
        <h1 className="font-display text-[34px] leading-[0.95] font-bold tracking-[-0.04em] text-ink sm:text-[46px]">{title}</h1>
        {description ? <p className="mt-2.5 max-w-2xl text-[15px] text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

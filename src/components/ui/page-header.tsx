import type { ReactNode } from "react";

import { cn } from "./cn";

export type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Kleine Zeile über dem Titel, z. B. „SONNTAG, 1. NOVEMBER 2026“. */
  eyebrow?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, eyebrow, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="font-display text-[30px] leading-[1.05] font-extrabold tracking-[-0.035em] text-ink sm:text-[34px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[15px] text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./cn";

export type StatDelta = { value: string; direction: "up" | "down" | "flat"; good?: boolean };

export type StatProps = {
  label: ReactNode;
  value: ReactNode;
  delta?: StatDelta;
  hint?: ReactNode;
  /** Trend (z. B. `<Sparkline>`) unter dem Wert. */
  children?: ReactNode;
  /** `lg` = besonders grosse Zahl. */
  size?: "sm" | "md" | "lg";
  /** `hero` = wichtigste Kennzahl einer Seite auf Akzentfläche (genau eine pro Ansicht). */
  variant?: "default" | "hero";
  className?: string;
};

const VALUE_SIZES = {
  sm: "text-lg tracking-[-0.02em]",
  md: "text-[30px] leading-none tracking-[-0.035em]",
  lg: "text-[44px] leading-none tracking-[-0.045em] sm:text-[56px]",
} as const;

const DIRECTION_TEXT = { up: "gestiegen", down: "gesunken", flat: "unverändert" } as const;

/** „CHF 48’210.00“ → kleines, gedämpftes „CHF“ + Betrag. Andere Werte (ReactNode) bleiben unverändert. */
function renderValue(value: ReactNode, hero: boolean): ReactNode {
  if (typeof value !== "string") return value;
  const m = value.match(/^(CHF)[\s\u00a0](-?[\d’'.]+)$/);
  if (!m) return value;
  const [, unit, amount] = m;
  return (
    <>
      <span data-unit className={cn("mr-1 text-[0.47em] font-semibold tracking-normal", hero ? "text-accent-ink/80" : "text-ink-muted")}>
        {unit}
      </span>
      {amount}
    </>
  );
}

export function Stat({ label, value, delta, hint, children, size = "md", variant = "default", className }: StatProps) {
  const hero = variant === "hero";
  const good = delta ? (delta.good ?? (delta.direction === "up" ? true : delta.direction === "down" ? false : undefined)) : undefined;
  const deltaColor = hero ? "text-accent-ink" : !delta || delta.direction === "flat" ? "text-ink-muted" : good ? "text-success" : "text-danger";
  const Arrow = delta?.direction === "up" ? ArrowUpRight : delta?.direction === "down" ? ArrowDownRight : Minus;

  return (
    <div className={cn("min-w-0", hero && "rounded-card bg-accent p-5 text-accent-ink", className)}>
      <p className={cn("text-[13px] font-semibold", hero ? "text-accent-ink/90" : "text-ink-muted")}>{label}</p>
      <p className={cn("mt-2 font-num font-extrabold whitespace-nowrap", hero ? "text-accent-ink" : "text-ink", VALUE_SIZES[size])}>{renderValue(value, hero)}</p>
      {delta || hint ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
          {delta ? (
            <span className={cn("inline-flex items-center gap-0.5 font-num font-bold", deltaColor)}>
              <Arrow aria-hidden className="size-3.5" />
              <span className="sr-only">{DIRECTION_TEXT[delta.direction]}:</span>
              {delta.value}
            </span>
          ) : null}
          {hint ? <span className={hero ? "text-accent-ink/85" : "text-ink-muted"}>{hint}</span> : null}
        </p>
      ) : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

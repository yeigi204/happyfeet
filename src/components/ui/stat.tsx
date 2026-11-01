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
  /** `lg` = Hero-Kennzahl (genau eine pro Ansicht). */
  size?: "sm" | "md" | "lg";
  className?: string;
};

const VALUE_SIZES = {
  sm: "text-lg",
  md: "text-[26px] leading-none tracking-[-0.03em]",
  lg: "text-[52px] leading-[0.9] tracking-[-0.05em] sm:text-[76px]",
} as const;

const DIRECTION_TEXT = { up: "gestiegen", down: "gesunken", flat: "unverändert" } as const;

/**
 * „CHF 48’210.00“ → kleines, gedämpftes „CHF“ + Betrag + gedämpfte Rappen.
 * Andere Werte (ReactNode) werden unverändert gerendert.
 */
function renderValue(value: ReactNode, size: StatProps["size"]): ReactNode {
  if (typeof value !== "string") return value;
  const m = value.match(/^(CHF)[\s ](-?[\d’'.]+?)(\.\d{2})?$/);
  if (!m) return value;
  const [, unit, amount, cents] = m;
  return (
    <>
      <span data-unit className={cn("font-sans font-medium tracking-normal text-ink-faint", size === "lg" ? "mr-2 align-[0.95em] text-[13px] sm:text-[15px]" : "mr-1 text-[0.5em]")}>
        {unit}
      </span>
      {amount}
      {cents ? <span className={cn("text-ink-faint", size === "lg" && "text-[0.55em] tracking-[-0.02em]")}>{cents}</span> : null}
    </>
  );
}

export function Stat({ label, value, delta, hint, children, size = "md", className }: StatProps) {
  const good = delta ? (delta.good ?? (delta.direction === "up" ? true : delta.direction === "down" ? false : undefined)) : undefined;
  const deltaColor = !delta || delta.direction === "flat" ? "text-ink-muted" : good ? "text-success" : "text-danger";
  const Arrow = delta?.direction === "up" ? ArrowUpRight : delta?.direction === "down" ? ArrowDownRight : Minus;

  return (
    <div className={cn("min-w-0", className)}>
      <p className={cn("text-ink-muted", size === "lg" ? "eyebrow" : "text-[12.5px]")}>{label}</p>
      <p className={cn("mt-2 font-mono font-medium whitespace-nowrap text-ink", VALUE_SIZES[size])}>{renderValue(value, size)}</p>
      {delta || hint ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {delta ? (
            <span className={cn("inline-flex items-center gap-0.5 font-mono font-medium tabular-nums", deltaColor)}>
              <Arrow aria-hidden className="size-3.5" />
              <span className="sr-only">{DIRECTION_TEXT[delta.direction]}:</span>
              {delta.value}
            </span>
          ) : null}
          {hint ? <span className="text-ink-faint">{hint}</span> : null}
        </p>
      ) : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

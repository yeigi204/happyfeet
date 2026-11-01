import { Check, Clock, OctagonAlert, Sparkle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./cn";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "premium";

const TONES: Record<BadgeTone, { box: string; icon: ReactNode }> = {
  neutral: { box: "bg-surface-2 text-ink", icon: null },
  accent: { box: "bg-accent-soft text-accent-strong", icon: <span aria-hidden className="size-1.5 rounded-full bg-accent" /> },
  success: { box: "bg-success-soft text-success", icon: <Check aria-hidden /> },
  warning: { box: "bg-warning-soft text-warning", icon: <Clock aria-hidden /> },
  danger: { box: "bg-danger-soft text-danger", icon: <OctagonAlert aria-hidden /> },
  premium: { box: "bg-accent-soft text-accent-strong", icon: <Sparkle aria-hidden className="fill-current" /> },
};

export type BadgeProps = {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  /** Eigenes Icon oder `false`; Status-Töne haben ein Default-Icon (Farbe nie allein). */
  icon?: ReactNode | false;
  title?: string;
};

export function Badge({ tone = "neutral", children, className, icon, title }: BadgeProps) {
  const t = TONES[tone];
  const glyph = icon === false ? null : (icon ?? t.icon);
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs leading-none font-bold whitespace-nowrap",
        "[&_svg]:size-3.5 [&_svg]:shrink-0",
        t.box,
        className,
      )}
    >
      {glyph}
      {children}
    </span>
  );
}

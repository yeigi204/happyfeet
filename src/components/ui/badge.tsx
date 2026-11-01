import { Check, Gem, OctagonAlert, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./cn";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "premium";

const TONES: Record<BadgeTone, { box: string; icon: ReactNode }> = {
  neutral: { box: "border-line bg-surface-2 text-ink-muted", icon: null },
  accent: {
    box: "border-accent/35 bg-accent-soft text-ink",
    icon: <span aria-hidden className="size-1.5 rounded-full bg-accent" />,
  },
  success: { box: "border-success/35 bg-success/10 text-ink", icon: <Check aria-hidden className="text-success" /> },
  warning: { box: "border-warning/40 bg-warning/10 text-ink", icon: <TriangleAlert aria-hidden className="text-warning" /> },
  danger: { box: "border-danger/40 bg-danger/10 text-ink", icon: <OctagonAlert aria-hidden className="text-danger" /> },
  premium: { box: "border-premium/40 bg-premium-soft text-ink", icon: <Gem aria-hidden className="text-premium" /> },
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
        "inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-[4px] border px-1.5 text-[11.5px] leading-none font-medium whitespace-nowrap",
        "[&_svg]:size-3 [&_svg]:shrink-0",
        t.box,
        className,
      )}
    >
      {glyph}
      {children}
    </span>
  );
}

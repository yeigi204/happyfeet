import { Flag } from "lucide-react";

import { cn } from "@/components/ui/cn";

export type QueuePillProps = {
  count: number;
  /** Was gezählt wird, z. B. „offene Meldungen“ (Screenreader + Tooltip). */
  label: string;
  /** `alert` = Nagellack-Rot, nur für Dinge, die nicht warten sollten (Meldungen). */
  tone?: "neutral" | "alert";
  className?: string;
};

/** Zähler in der Admin-Navigation. Bei 0 unsichtbar – Ruhe ist die Belohnung. */
export function QueuePill({ count, label, tone = "neutral", className }: QueuePillProps) {
  if (count <= 0) return null;
  const text = count > 99 ? "99+" : String(count);
  return (
    <span
      title={`${count} ${label}`}
      className={cn(
        "inline-flex h-[18px] min-w-[22px] shrink-0 items-center justify-center gap-0.5 rounded-[3px] px-1 font-mono text-[10.5px] leading-none font-semibold tabular-nums",
        tone === "alert" ? "bg-accent text-accent-ink" : "border border-line-strong text-ink-muted",
        className,
      )}
    >
      {tone === "alert" ? <Flag aria-hidden className="size-2.5" strokeWidth={2.5} /> : null}
      <span aria-hidden>{text}</span>
      <span className="sr-only">
        {count} {label}
      </span>
    </span>
  );
}

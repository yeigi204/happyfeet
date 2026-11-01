import { Flag } from "lucide-react";

import { cn } from "@/components/ui/cn";

export type QueuePillProps = {
  count: number;
  /** Was gezählt wird, z. B. „offene Meldungen“ (Screenreader + Tooltip). */
  label: string;
  /** `alert` = Akzent mit Fahne, nur für Dinge, die nicht warten sollten (Meldungen). */
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
        "inline-flex h-5 min-w-6 shrink-0 items-center justify-center gap-0.5 rounded-full px-1.5 font-num text-[11px] leading-none font-bold",
        tone === "alert" ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink",
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

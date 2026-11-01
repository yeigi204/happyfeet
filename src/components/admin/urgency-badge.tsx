import { Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { URGENCY_LABELS, urgencyFor, type Urgency } from "./lib/urgency";

const TONES = { ok: "neutral", due: "warning", overdue: "danger" } as const;

/** Dringlichkeit mit Icon + Label (Farbe nie allein). `null`-Alter → nichts. */
export function UrgencyBadge({ oldestAt, now, urgency, className }: { oldestAt?: Date | null; now: Date; urgency?: Urgency | null; className?: string }) {
  const level = urgency ?? urgencyFor(oldestAt, now);
  if (!level) return null;
  return (
    <Badge tone={TONES[level]} icon={level === "ok" ? <Clock3 aria-hidden /> : undefined} className={className}>
      {URGENCY_LABELS[level]}
    </Badge>
  );
}

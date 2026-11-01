import { Flag } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const SEVERITY = {
  critical: { tone: "danger", label: "Kritisch" },
  high: { tone: "warning", label: "Hoch" },
  normal: { tone: "neutral", label: "Normal" },
} as const;

/** Schwere einer Meldung – immer Icon + Label. */
export function SeverityBadge({ severity, className }: { severity: keyof typeof SEVERITY; className?: string }) {
  const s = SEVERITY[severity];
  return (
    <Badge tone={s.tone} icon={severity === "normal" ? <Flag aria-hidden /> : undefined} className={className}>
      {s.label}
    </Badge>
  );
}

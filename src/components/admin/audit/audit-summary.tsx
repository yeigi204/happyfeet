import { Fragment } from "react";

import { cn } from "@/components/ui/cn";

import type { AuditSegment, AuditTone } from "./describe";

export const AUDIT_TONE_CLASSES: Record<AuditTone, string> = {
  neutral: "text-ink-faint",
  success: "text-success",
  danger: "text-danger",
  accent: "text-accent",
};

/** Satz eines Audit-Eintrags; Namen und Beträge hervorgehoben. */
export function AuditSummary({ segments, className }: { segments: readonly AuditSegment[]; className?: string }) {
  return (
    <span className={cn("text-ink-muted [&_b]:font-medium [&_b]:text-ink", className)}>
      {segments.map((segment, i) => (
        <Fragment key={i}>{typeof segment === "string" ? segment : <b>{segment.strong}</b>}</Fragment>
      ))}
    </span>
  );
}

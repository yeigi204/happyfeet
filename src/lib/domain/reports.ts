import type { ReportReason } from "./types";

export const REPORT_REASONS: Record<ReportReason, { label: string; severity: "critical" | "high" | "normal" }> = {
  possible_minor: { label: "Möglicherweise minderjährige Person", severity: "critical" },
  non_consensual: { label: "Ohne Einverständnis veröffentlicht", severity: "critical" },
  not_own_content: { label: "Nicht die eigenen Inhalte", severity: "high" },
  spam: { label: "Spam", severity: "normal" },
  other: { label: "Anderes", severity: "normal" },
};

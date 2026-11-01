import type { ModerationStatus, PostVisibility, ReportReason } from "@/lib/domain/types";

/** Serialisierbare Sicht auf die Moderations-Queue (nur, was die Triage braucht). */
export type TriageMedia = { id: string; url: string; width: number; height: number };

export type TriagePost = {
  id: string;
  caption: string;
  visibility: PostVisibility;
  moderationStatus: ModerationStatus;
  createdAt: Date;
  deletedAt: Date | null;
  creator: { userId: string; handle: string; displayName: string; isPremium: boolean; approvedPostCount: number };
  media: TriageMedia[];
};

export type TriageReport = {
  id: string;
  reason: ReportReason;
  severity: "critical" | "high" | "normal";
  details: string;
  createdAt: Date;
  reporterHandle: string | null;
  openReportsOnPost: number;
};

export type TriageItem =
  | { key: string; kind: "post"; post: TriagePost }
  | { key: string; kind: "report"; post: TriagePost; report: TriageReport };

export type TriageMode = "premoderation" | "reports";

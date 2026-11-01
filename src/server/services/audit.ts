import "server-only";

import { getDb, type DbOrTx } from "@/server/db/client";
import { auditLog } from "@/server/db/schema";

/**
 * Bekannte Audit-Aktionen. Neue Aktionen hier ergänzen, damit UI (Aktivitäts-Feed) sie beschriften kann.
 */
export type AuditAction =
  | "creator.applied"
  | "creator.approved"
  | "creator.rejected"
  | "post.approved"
  | "post.rejected"
  | "post.removed"
  | "report.resolved"
  | "report.dismissed"
  | "user.banned"
  | "user.unbanned"
  | "user.admin_granted"
  | "settings.updated"
  | "payouts.generated"
  | "payout.paid"
  | "subscription.activated"
  | "subscription.canceled"
  | "premium.activated"
  | "premium.canceled";

/**
 * Aktionen, für die der Aktivitäts-Feed noch keine eigene Beschriftung hat (er zeigt sie mit ihrem
 * technischen Namen). Sobald `src/components/admin/audit/describe.ts` sie beschriftet, nach
 * `AuditAction` verschieben.
 */
export type UnlabeledAuditAction = "user.deleted";

export interface AuditInput {
  /** null = System */
  actorId: string | null;
  action: AuditAction | UnlabeledAuditAction;
  targetType?: "user" | "creator" | "post" | "report" | "payout" | "settings" | "subscription" | "premium";
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(input: AuditInput, db: DbOrTx = getDb()): Promise<void> {
  await db.insert(auditLog).values({
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? {},
  });
}

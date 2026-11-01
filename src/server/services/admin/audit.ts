import "server-only";

import { and, desc, eq, lt, type SQL } from "drizzle-orm";

import type { Viewer } from "@/lib/domain/types";
import { assertAdmin } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { auditLog, users } from "@/server/db/schema";

/** Ein Eintrag im Audit-Log bzw. Aktivitäts-Feed. `actor` ist `null` für System-Aktionen (oder gelöschte Nutzer). */
export type AuditFeedItem = {
  id: string;
  action: string;
  actor: { id: string; handle: string | null; displayName: string | null } | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_ACTION_LENGTH = 64;

function clampLimit(value: number | undefined): number {
  const n = Math.trunc(value ?? DEFAULT_LIMIT);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_LIMIT) : DEFAULT_LIMIT;
}

/**
 * Audit-Log, neueste zuerst. `before` blättert (exklusiv) zurück, `action` filtert exakt
 * (z. B. `"post.removed"`). Limit 1–200, Standard 50.
 */
export async function listAuditLog(
  admin: Viewer,
  input: { limit?: number; before?: Date; action?: string } = {},
): Promise<AuditFeedItem[]> {
  assertAdmin(admin);
  const conditions: SQL[] = [];
  if (input.before instanceof Date && !Number.isNaN(input.before.getTime())) {
    conditions.push(lt(auditLog.createdAt, input.before));
  }
  const action = input.action?.trim().slice(0, MAX_ACTION_LENGTH);
  if (action) conditions.push(eq(auditLog.action, action));

  const rows = await getDb()
    .select({
      id: auditLog.id,
      action: auditLog.action,
      actorId: users.id,
      actorHandle: users.handle,
      actorDisplayName: users.displayName,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(clampLimit(input.limit));

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actor: row.actorId ? { id: row.actorId, handle: row.actorHandle, displayName: row.actorDisplayName } : null,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: row.metadata ?? {},
    createdAt: row.createdAt,
  }));
}

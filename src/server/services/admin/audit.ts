import "server-only";

import { and, desc, eq, inArray, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Viewer } from "@/lib/domain/types";
import { assertAdmin } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { auditLog, users } from "@/server/db/schema";

type AuditUser = { id: string; handle: string | null; displayName: string | null };

/** Ein Eintrag im Audit-Log bzw. Aktivitäts-Feed. `actor` ist `null` für System-Aktionen (oder gelöschte Nutzer). */
export type AuditFeedItem = {
  id: string;
  action: string;
  actor: AuditUser | null;
  targetType: string | null;
  targetId: string | null;
  /** Aufgelöstes Ziel bei `targetType` `user`/`creator`; sonst `null`. */
  target: AuditUser | null;
  /** Aufgelöster Creator aus `metadata.creatorId` (Abos, Premium, Auszahlungen …); sonst `null`. */
  creator: AuditUser | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  /** Opaker, stabiler Cursor (Zeitstempel in µs + ID) für `listAuditLog({ cursor })` – „älter als dieser Eintrag“. */
  cursor: string;
};

const CURSOR_PATTERN = /^(\d{1,20})_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** `(created_at, id)` kleiner als der Cursor; ungültige Cursor → `null` (dann erste Seite). */
function cursorCondition(cursor: string | undefined): SQL | null {
  const match = typeof cursor === "string" ? CURSOR_PATTERN.exec(cursor) : null;
  if (!match) return null;
  const [, micros, id] = match;
  return sql`(${auditLog.createdAt}, ${auditLog.id}) < ('epoch'::timestamptz + ${micros}::bigint * interval '1 microsecond', ${id}::uuid)`;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_ACTION_LENGTH = 64;

function clampLimit(value: number | undefined): number {
  const n = Math.trunc(value ?? DEFAULT_LIMIT);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_LIMIT) : DEFAULT_LIMIT;
}

/**
 * Audit-Log, neueste zuerst (`created_at`, dann `id`). Blättern: `cursor` (aus `AuditFeedItem.cursor`,
 * stabil auch bei gleichen Zeitstempeln) oder – älter – `before` (exklusiv, Millisekunden). `action`
 * filtert exakt (z. B. `"post.removed"`). Limit 1–200, Standard 50.
 */
export async function listAuditLog(
  admin: Viewer,
  input: { limit?: number; before?: Date; cursor?: string; action?: string } = {},
): Promise<AuditFeedItem[]> {
  assertAdmin(admin);
  const conditions: SQL[] = [];
  if (input.before instanceof Date && !Number.isNaN(input.before.getTime())) {
    conditions.push(lt(auditLog.createdAt, input.before));
  }
  const afterCursor = cursorCondition(input.cursor);
  if (afterCursor) conditions.push(afterCursor);
  const action = input.action?.trim().slice(0, MAX_ACTION_LENGTH);
  if (action) conditions.push(eq(auditLog.action, action));

  const targetUser = alias(users, "audit_target_user");
  const metaCreator = alias(users, "audit_meta_creator");
  const rows = await getDb()
    .select({
      id: auditLog.id,
      action: auditLog.action,
      actorId: users.id,
      actorHandle: users.handle,
      actorDisplayName: users.displayName,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      targetUserId: targetUser.id,
      targetHandle: targetUser.handle,
      targetDisplayName: targetUser.displayName,
      creatorId: metaCreator.id,
      creatorHandle: metaCreator.handle,
      creatorDisplayName: metaCreator.displayName,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
      createdAtMicros: sql<string>`(extract(epoch from ${auditLog.createdAt}) * 1000000)::bigint::text`,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .leftJoin(
      targetUser,
      and(inArray(auditLog.targetType, ["user", "creator"]), eq(sql`${targetUser.id}::text`, auditLog.targetId)),
    )
    .leftJoin(metaCreator, eq(sql`${metaCreator.id}::text`, sql`${auditLog.metadata} ->> 'creatorId'`))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(clampLimit(input.limit));

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actor: row.actorId ? { id: row.actorId, handle: row.actorHandle, displayName: row.actorDisplayName } : null,
    targetType: row.targetType,
    targetId: row.targetId,
    target: row.targetUserId
      ? { id: row.targetUserId, handle: row.targetHandle, displayName: row.targetDisplayName }
      : null,
    creator: row.creatorId ? { id: row.creatorId, handle: row.creatorHandle, displayName: row.creatorDisplayName } : null,
    metadata: row.metadata ?? {},
    createdAt: row.createdAt,
    cursor: `${row.createdAtMicros}_${row.id}`,
  }));
}

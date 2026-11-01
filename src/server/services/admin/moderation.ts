import "server-only";

import { and, asc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";

import { REPORT_REASONS } from "@/lib/domain/reports";
import type { ModerationStatus, PostVisibility, ReportReason, Viewer } from "@/lib/domain/types";
import { assertAdmin } from "@/server/auth/guards";
import { getDb, type Tx } from "@/server/db/client";
import { postMedia, posts, premiumSubscriptions, reports, users } from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { writeAudit } from "@/server/services/audit";
import { signMediaUrls } from "@/server/storage";

/** Ein Post in der Moderation. Admins sehen die **Originale** (signiert, 300 s gültig). */
export type ModerationPost = {
  id: string;
  caption: string;
  visibility: PostVisibility;
  moderationStatus: ModerationStatus;
  createdAt: Date;
  /** Vom Creator gelöscht (bei Meldungen möglich) – sonst `null`. */
  deletedAt: Date | null;
  creator: { userId: string; handle: string; displayName: string; isPremium: boolean; approvedPostCount: number };
  media: { id: string; url: string; width: number; height: number }[];
};

export type ModerationReport = {
  id: string;
  reason: ReportReason;
  severity: "critical" | "high" | "normal";
  details: string;
  createdAt: Date;
  reporter: { handle: string | null } | null;
  openReportsOnPost: number;
  post: ModerationPost;
};

type Opts = { now?: Date };

const QUEUE_LIMIT = 200;
const NOTE_MAX_LENGTH = 1000;
const POST_NOT_FOUND = "Dieser Post existiert nicht.";
const REPORT_NOT_FOUND = "Diese Meldung existiert nicht.";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SEVERITY_RANK = { critical: 0, high: 1, normal: 2 } as const;

/** Sortierschlüssel der Meldung nach Schwere (kritisch = 0, hoch = 1, normal = 2), aus `REPORT_REASONS`. */
const severityRank = sql`(case ${reports.reason} ${sql.join(
  (Object.keys(REPORT_REASONS) as ReportReason[]).map(
    (reason) => sql`when ${reason} then ${sql.raw(String(SEVERITY_RANK[REPORT_REASONS[reason].severity]))}`,
  ),
  sql` `,
)} else ${sql.raw(String(SEVERITY_RANK.normal))} end)`;

function parseNote(note: unknown, required: boolean): string | null {
  const value = typeof note === "string" ? note.replaceAll("\u0000", "").trim() : "";
  if (required && value.length === 0) {
    throw new ValidationError("Bitte gib eine Begründung an.", { note: ["Eine Notiz ist Pflicht."] });
  }
  if (value.length > NOTE_MAX_LENGTH) {
    throw new ValidationError("Die Notiz ist zu lang.", { note: [`Höchstens ${NOTE_MAX_LENGTH} Zeichen.`] });
  }
  return value.length > 0 ? value : null;
}

// ─── Queue ────────────────────────────────────────────────────────────────────

/** Lädt Posts samt Creator-Infos und signierten Originalen – drei Queries, eine Batch-Signierung. */
async function loadModerationPosts(postIds: string[], now: Date): Promise<Map<string, ModerationPost>> {
  if (postIds.length === 0) return new Map();
  const db = getDb();
  const approvedPosts = sql`(select count(*)::int from ${posts} as ap where ap.creator_id = ${posts.creatorId} and ap.moderation_status = 'approved' and ap.deleted_at is null)`;
  const isPremium = sql<boolean>`exists (select 1 from ${premiumSubscriptions} where ${and(
    eq(premiumSubscriptions.creatorId, posts.creatorId),
    inArray(premiumSubscriptions.status, ["active", "canceled"]),
    gt(premiumSubscriptions.currentPeriodEnd, now),
  )})`;

  const rows = await db
    .select({
      id: posts.id,
      caption: posts.caption,
      visibility: posts.visibility,
      moderationStatus: posts.moderationStatus,
      createdAt: posts.createdAt,
      deletedAt: posts.deletedAt,
      creatorId: posts.creatorId,
      handle: users.handle,
      displayName: users.displayName,
      isPremium,
      approvedPostCount: sql<number>`${approvedPosts}`,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.creatorId))
    .where(inArray(posts.id, postIds));

  const media = await db
    .select({
      id: postMedia.id,
      postId: postMedia.postId,
      position: postMedia.position,
      originalKey: postMedia.originalKey,
      width: postMedia.width,
      height: postMedia.height,
    })
    .from(postMedia)
    .where(inArray(postMedia.postId, postIds))
    .orderBy(asc(postMedia.postId), asc(postMedia.position));

  // Admins dürfen alles sehen → Originale signieren (gebündelt).
  const urls = await signMediaUrls(media.map((m) => m.originalKey));
  const mediaByPost = new Map<string, ModerationPost["media"]>();
  for (const m of media) {
    const url = urls.get(m.originalKey);
    if (!url) throw new Error(`Medien-URL für ${m.id} konnte nicht signiert werden.`);
    const list = mediaByPost.get(m.postId) ?? [];
    list.push({ id: m.id, url, width: m.width, height: m.height });
    mediaByPost.set(m.postId, list);
  }

  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        caption: row.caption,
        visibility: row.visibility,
        moderationStatus: row.moderationStatus,
        createdAt: row.createdAt,
        deletedAt: row.deletedAt,
        creator: {
          userId: row.creatorId,
          handle: row.handle ?? "",
          displayName: row.displayName ?? row.handle ?? "",
          isPremium: Boolean(row.isPremium),
          approvedPostCount: Number(row.approvedPostCount),
        },
        media: mediaByPost.get(row.id) ?? [],
      },
    ]),
  );
}

/**
 * Moderations-Queue: wartende Posts (Vorab-Prüfung, älteste zuerst) und offene Meldungen
 * (die schwersten zuerst – kritisch, hoch, normal –, dann älteste). Medien sind signierte Original-URLs.
 */
export async function listModerationQueue(
  admin: Viewer,
  opts: Opts = {},
): Promise<{ pendingPosts: ModerationPost[]; openReports: ModerationReport[] }> {
  assertAdmin(admin);
  const now = opts.now ?? new Date();
  const db = getDb();

  const pending = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.moderationStatus, "pending"), isNull(posts.deletedAt)))
    .orderBy(asc(posts.createdAt), asc(posts.id))
    .limit(QUEUE_LIMIT);

  const openReportRows = await db
    .select({
      id: reports.id,
      postId: reports.postId,
      reason: reports.reason,
      details: reports.details,
      createdAt: reports.createdAt,
      reporterId: reports.reporterId,
      reporterHandle: users.handle,
      openReportsOnPost: sql<number>`(select count(*)::int from ${reports} as r2 where r2.post_id = ${reports.postId} and r2.status = 'open')`,
    })
    .from(reports)
    .leftJoin(users, eq(users.id, reports.reporterId))
    .where(eq(reports.status, "open"))
    .orderBy(asc(severityRank), asc(reports.createdAt), asc(reports.id))
    .limit(QUEUE_LIMIT);

  const postIds = [...new Set([...pending.map((p) => p.id), ...openReportRows.map((r) => r.postId)])];
  const postsById = await loadModerationPosts(postIds, now);

  const pendingPosts = pending.flatMap((p) => {
    const post = postsById.get(p.id);
    return post ? [post] : [];
  });
  const openReports = openReportRows.flatMap((r): ModerationReport[] => {
    const post = postsById.get(r.postId);
    if (!post) return [];
    return [
      {
        id: r.id,
        reason: r.reason,
        severity: REPORT_REASONS[r.reason].severity,
        details: r.details,
        createdAt: r.createdAt,
        reporter: r.reporterId ? { handle: r.reporterHandle } : null,
        openReportsOnPost: Number(r.openReportsOnPost),
        post,
      },
    ];
  });

  return { pendingPosts, openReports };
}

// ─── Entscheidungen zu Posts ──────────────────────────────────────────────────

async function lockPost(tx: Tx, postId: string) {
  if (!UUID_PATTERN.test(postId)) throw new NotFoundError(POST_NOT_FOUND);
  const [post] = await tx
    .select({ id: posts.id, creatorId: posts.creatorId, status: posts.moderationStatus, deletedAt: posts.deletedAt })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1)
    .for("update");
  if (!post) throw new NotFoundError(POST_NOT_FOUND);
  return post;
}

async function decidePending(
  admin: Viewer,
  postId: string,
  decision: "approved" | "rejected",
  note: string | null,
  now: Date,
): Promise<void> {
  await getDb().transaction(async (tx) => {
    const post = await lockPost(tx, postId);
    if (post.deletedAt) throw new NotFoundError("Dieser Post wurde vom Creator gelöscht.");
    if (post.status !== "pending") throw new ConflictError("Dieser Post wartet nicht (mehr) auf eine Prüfung.");

    const updated = await tx
      .update(posts)
      .set({
        moderationStatus: decision,
        moderationNote: note,
        moderatedBy: admin.id,
        moderatedAt: now,
        ...(decision === "approved"
          ? { publishedAt: sql`coalesce(${posts.publishedAt}, ${now.toISOString()}::timestamptz)` }
          : {}),
      })
      .where(and(eq(posts.id, postId), eq(posts.moderationStatus, "pending")))
      .returning({ id: posts.id });
    if (updated.length === 0) throw new ConflictError("Dieser Post wurde gerade schon geprüft.");

    await writeAudit(
      {
        actorId: admin.id,
        action: decision === "approved" ? "post.approved" : "post.rejected",
        targetType: "post",
        targetId: postId,
        metadata: { creatorId: post.creatorId, note },
      },
      tx,
    );
  });
}

/** Gibt einen Post aus der Vorab-Prüfung frei (setzt `published_at`, falls noch leer). */
export async function approvePost(admin: Viewer, postId: string, opts: Opts = {}): Promise<void> {
  assertAdmin(admin);
  await decidePending(admin, postId, "approved", null, opts.now ?? new Date());
}

/** Lehnt einen Post aus der Vorab-Prüfung ab; die Notiz (sieht der Creator) ist Pflicht. */
export async function rejectPost(admin: Viewer, postId: string, note: string, opts: Opts = {}): Promise<void> {
  assertAdmin(admin);
  const parsed = parseNote(note, true);
  await decidePending(admin, postId, "rejected", parsed, opts.now ?? new Date());
}

/**
 * Entfernt einen Post (egal in welchem Status, auch nach Löschung durch den Creator) und
 * löst alle offenen Meldungen dazu mit derselben Notiz.
 */
export async function removePost(admin: Viewer, postId: string, note: string, opts: Opts = {}): Promise<void> {
  assertAdmin(admin);
  const parsed = parseNote(note, true);
  const now = opts.now ?? new Date();

  await getDb().transaction(async (tx) => {
    const post = await lockPost(tx, postId);
    if (post.status === "removed") throw new ConflictError("Dieser Post wurde bereits entfernt.");

    await tx
      .update(posts)
      .set({ moderationStatus: "removed", moderationNote: parsed, moderatedBy: admin.id, moderatedAt: now })
      .where(and(eq(posts.id, postId), ne(posts.moderationStatus, "removed")));

    const resolved = await tx
      .update(reports)
      .set({ status: "resolved", resolutionNote: parsed, resolvedBy: admin.id, resolvedAt: now })
      .where(and(eq(reports.postId, postId), eq(reports.status, "open")))
      .returning({ id: reports.id });

    await writeAudit(
      {
        actorId: admin.id,
        action: "post.removed",
        targetType: "post",
        targetId: postId,
        metadata: {
          creatorId: post.creatorId,
          note: parsed,
          previousStatus: post.status,
          resolvedReports: resolved.length,
          reportIds: resolved.map((r) => r.id),
        },
      },
      tx,
    );
  });
}

// ─── Meldungen ────────────────────────────────────────────────────────────────

async function closeReport(
  admin: Viewer,
  reportId: string,
  status: "resolved" | "dismissed",
  note: string | null,
  now: Date,
): Promise<void> {
  if (!UUID_PATTERN.test(reportId)) throw new NotFoundError(REPORT_NOT_FOUND);
  await getDb().transaction(async (tx) => {
    const [report] = await tx
      .select({ id: reports.id, postId: reports.postId, reason: reports.reason, status: reports.status })
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1);
    if (!report) throw new NotFoundError(REPORT_NOT_FOUND);
    if (report.status !== "open") throw new ConflictError("Diese Meldung ist bereits erledigt.");

    const updated = await tx
      .update(reports)
      .set({ status, resolutionNote: note, resolvedBy: admin.id, resolvedAt: now })
      .where(and(eq(reports.id, reportId), eq(reports.status, "open")))
      .returning({ id: reports.id });
    if (updated.length === 0) throw new ConflictError("Diese Meldung wurde gerade schon bearbeitet.");

    await writeAudit(
      {
        actorId: admin.id,
        action: status === "resolved" ? "report.resolved" : "report.dismissed",
        targetType: "report",
        targetId: reportId,
        metadata: { postId: report.postId, reason: report.reason, note },
      },
      tx,
    );
  });
}

/** Meldung als berechtigt erledigt (Massnahme ausserhalb des Entfernens, z. B. Creator kontaktiert). */
export async function resolveReport(admin: Viewer, reportId: string, note?: string, opts: Opts = {}): Promise<void> {
  assertAdmin(admin);
  await closeReport(admin, reportId, "resolved", parseNote(note, false), opts.now ?? new Date());
}

/** Meldung als unbegründet verwerfen. */
export async function dismissReport(admin: Viewer, reportId: string, note?: string, opts: Opts = {}): Promise<void> {
  assertAdmin(admin);
  await closeReport(admin, reportId, "dismissed", parseNote(note, false), opts.now ?? new Date());
}

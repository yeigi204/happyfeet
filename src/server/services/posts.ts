import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, gt, inArray, isNull, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { canViewPostMedia, isPostListed } from "@/lib/domain/access";
import { initialModerationStatus } from "@/lib/domain/moderation";
import { POST_LIMITS } from "@/lib/domain/posts";
import type {
  ModerationStatus,
  PostVisibility,
  UserStatus,
  VerificationStatus,
  Viewer,
  ViewerIdentity,
} from "@/lib/domain/types";
import { assertActive, assertApprovedCreator, assertCreator } from "@/server/auth/guards";
import { getDb, type DbOrTx } from "@/server/db/client";
import {
  creatorProfiles,
  postMedia,
  posts,
  premiumSubscriptions,
  subscriptions,
  users,
  type Post,
  type PostMedia,
} from "@/server/db/schema";
import { ForbiddenError, NotFoundError, ValidationError, type FieldErrors } from "@/server/errors";
import { getMediaStorage, signMediaUrls, type MediaStorage } from "@/server/storage";
import { processUpload } from "@/server/storage/images";
import { mediaKeys } from "@/server/storage/keys";

import { mediaViewsForPosts, type MediaView } from "./media-urls";
import { getPlatformSettings } from "./settings";

export type PostView = {
  id: string;
  caption: string;
  visibility: PostVisibility;
  moderationStatus: ModerationStatus;
  /** Nur für Eigentümer und Admin, sonst immer `null`. */
  moderationNote: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  /** `true`: nur verpixelte Vorschauen (`media[].isPreview`), kein Original. */
  locked: boolean;
  mediaCount: number;
  media: MediaView[];
  creator: { userId: string; handle: string; displayName: string; avatarUrl: string | null; isPremium: boolean };
};

type Opts = { now?: Date };

const FEED_DEFAULT_LIMIT = 20;
const FEED_MAX_LIMIT = 50;
const VISIBILITIES: readonly PostVisibility[] = ["public", "subscribers"];
const POST_NOT_FOUND = "Dieser Post wurde nicht gefunden.";

// ─── Gemeinsame Bausteine (auch für creators.ts und reports.ts) ──────────────

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Schützt Queries vor ungültigen IDs aus URLs (Postgres würde sonst mit einem Syntaxfehler abbrechen). */
export function isUuid(value: string): boolean {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * Identität für Zugriffsentscheidungen. Gesperrte Nutzer zählen wie anonyme Besucher –
 * ohne Admin-, Eigentümer- oder Abo-Vorrechte.
 */
export function accessIdentity(viewer: Viewer | null | undefined): ViewerIdentity {
  if (!viewer || viewer.status !== "active") return null;
  return { id: viewer.id, isAdmin: viewer.isAdmin };
}

/**
 * Ist der Creator für die Öffentlichkeit verborgen? Gesperrt, Konto gelöscht oder (nicht mehr) freigegeben.
 * Wird als `creatorBanned` an die Zugriffsregeln gereicht: dann sehen nur Admin und Eigentümer etwas.
 */
export function isCreatorHidden(
  status: UserStatus,
  verificationStatus: VerificationStatus | null,
  deletedAt: Date | null = null,
): boolean {
  return status !== "active" || deletedAt !== null || verificationStatus !== "approved";
}

/** Ganzzahliges Seitenlimit in [1, max]; fehlend oder ungültig → `fallback`. */
export function clampLimit(value: number | undefined, fallback: number, max: number): number {
  const n = Math.trunc(value ?? fallback);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : fallback;
}

/** Fan-Abos mit laufendem Zugriff (wie `isSubscriptionActive`): `active|canceled` und Periode läuft noch. */
export function activeSubscriptionCondition(now: Date): SQL {
  return and(inArray(subscriptions.status, ["active", "canceled"]), gt(subscriptions.currentPeriodEnd, now))!;
}

/** `true`, wenn der Creator (`creatorId`-Spalte der äusseren Query) gerade Premium ist (wie `isPremiumActive`). */
export function isPremiumSql(creatorId: AnyColumn, now: Date): SQL<boolean> {
  const condition = and(
    eq(premiumSubscriptions.creatorId, creatorId),
    inArray(premiumSubscriptions.status, ["active", "canceled"]),
    gt(premiumSubscriptions.currentPeriodEnd, now),
  );
  return sql<boolean>`exists (select 1 from ${premiumSubscriptions} where ${condition})`;
}

// ─── PostView-Aufbau ──────────────────────────────────────────────────────────

type CreatorMeta = {
  userId: string;
  handle: string | null;
  displayName: string | null;
  avatarKey: string | null;
  isPremium: boolean;
  hidden: boolean;
};

const sortTime = sql`coalesce(${posts.publishedAt}, ${posts.createdAt})`;

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

async function loadCreatorMeta(db: DbOrTx, creatorIds: string[], now: Date): Promise<Map<string, CreatorMeta>> {
  const rows = await db
    .select({
      userId: users.id,
      handle: users.handle,
      displayName: users.displayName,
      avatarKey: users.avatarKey,
      status: users.status,
      deletedAt: users.deletedAt,
      verificationStatus: creatorProfiles.verificationStatus,
      isPremium: isPremiumSql(users.id, now),
    })
    .from(users)
    .leftJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
    .where(inArray(users.id, creatorIds));
  return new Map(
    rows.map((r) => [
      r.userId,
      {
        userId: r.userId,
        handle: r.handle,
        displayName: r.displayName,
        avatarKey: r.avatarKey,
        isPremium: Boolean(r.isPremium),
        hidden: isCreatorHidden(r.status, r.verificationStatus, r.deletedAt),
      },
    ]),
  );
}

async function subscribedCreatorIds(
  db: DbOrTx,
  identity: ViewerIdentity,
  creatorIds: string[],
  now: Date,
): Promise<Set<string>> {
  if (!identity || creatorIds.length === 0) return new Set();
  const rows = await db
    .select({ creatorId: subscriptions.creatorId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.fanId, identity.id),
        inArray(subscriptions.creatorId, creatorIds),
        activeSubscriptionCondition(now),
      ),
    );
  return new Set(rows.map((r) => r.creatorId));
}

/**
 * Baut PostViews in der Reihenfolge von `rows`. Filtert zuerst mit `isPostListed`, entscheidet dann
 * pro Post mit `canViewPostMedia` zwischen Original und Vorschau. Signiert wird nur in `mediaViewsForPosts`.
 */
async function buildPostViews(
  db: DbOrTx,
  identity: ViewerIdentity,
  rows: Post[],
  now: Date,
  known?: { subscribedCreatorIds: Set<string> },
): Promise<PostView[]> {
  if (rows.length === 0) return [];
  const creatorIds = unique(rows.map((r) => r.creatorId));
  const [metas, subscribed] = await Promise.all([
    loadCreatorMeta(db, creatorIds, now),
    known ? known.subscribedCreatorIds : subscribedCreatorIds(db, identity, creatorIds, now),
  ]);

  const visible = rows.flatMap((post) => {
    const meta = metas.get(post.creatorId);
    if (!meta) return [];
    const access = { viewer: identity, post, creatorBanned: meta.hidden };
    if (!isPostListed(access)) return [];
    const locked = !canViewPostMedia({ ...access, hasActiveSubscription: subscribed.has(post.creatorId) });
    return [{ post, meta, locked }];
  });
  if (visible.length === 0) return [];

  const postIds = visible.map((v) => v.post.id);
  const mediaRows = await db
    .select()
    .from(postMedia)
    .where(inArray(postMedia.postId, postIds))
    .orderBy(asc(postMedia.position));
  const mediaByPost = new Map<string, PostMedia[]>();
  for (const row of mediaRows) {
    const list = mediaByPost.get(row.postId) ?? [];
    list.push(row);
    mediaByPost.set(row.postId, list);
  }

  const avatarKeys = unique(visible.map((v) => v.meta.avatarKey).filter((k): k is string => k !== null));
  const [mediaViews, avatarUrls] = await Promise.all([
    mediaViewsForPosts(visible.map((v) => ({ rows: mediaByPost.get(v.post.id) ?? [], locked: v.locked }))),
    signMediaUrls(avatarKeys),
  ]);

  return visible.map(({ post, meta, locked }, i) => {
    const privileged = identity !== null && (identity.isAdmin || identity.id === post.creatorId);
    return {
      id: post.id,
      caption: post.caption,
      visibility: post.visibility,
      moderationStatus: post.moderationStatus,
      moderationNote: privileged ? post.moderationNote : null,
      createdAt: post.createdAt,
      publishedAt: post.publishedAt,
      locked,
      mediaCount: mediaViews[i].length,
      media: mediaViews[i],
      creator: {
        userId: meta.userId,
        handle: meta.handle ?? "",
        displayName: meta.displayName ?? meta.handle ?? "",
        avatarUrl: meta.avatarKey ? (avatarUrls.get(meta.avatarKey) ?? null) : null,
        isPremium: meta.isPremium,
      },
    };
  });
}

// ─── Lesen ────────────────────────────────────────────────────────────────────

/**
 * Posts eines Creators fürs Profil, neueste zuerst. Fremde sehen nur freigegebene Posts eines aktiven,
 * freigegebenen Creators; Eigentümer und Admin zusätzlich pending/rejected/removed. Gelöschte nie.
 */
export async function listCreatorPosts(viewer: Viewer | null, creatorId: string, opts: Opts = {}): Promise<PostView[]> {
  const now = opts.now ?? new Date();
  if (!isUuid(creatorId)) return [];
  const identity = accessIdentity(viewer);
  const privileged = identity !== null && (identity.isAdmin || identity.id === creatorId);
  const db = getDb();

  const rows = await db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.creatorId, creatorId),
        isNull(posts.deletedAt),
        privileged ? undefined : eq(posts.moderationStatus, "approved"),
      ),
    )
    .orderBy(desc(sortTime), desc(posts.id));
  return buildPostViews(db, identity, rows, now);
}

/** Keyset-Cursor passend zur Sortierung `(coalesce(published_at, created_at) desc, id desc)`. */
function feedCursorCondition(before: Date | undefined, beforeId: string | undefined): SQL | undefined {
  if (before !== undefined && !(before instanceof Date && !Number.isNaN(before.getTime()))) {
    throw new ValidationError("Ungültiger Zeitpunkt.");
  }
  if (beforeId !== undefined && (before === undefined || !isUuid(beforeId))) {
    throw new ValidationError("Ungültiger Cursor.");
  }
  if (!before) return undefined;
  const at = sql`${before.toISOString()}::timestamptz`;
  return beforeId === undefined
    ? sql`${sortTime} < ${at}`
    : sql`(${sortTime}, ${posts.id}) < (${at}, ${beforeId}::uuid)`;
}

/**
 * Posts aller Creator, die der Viewer gerade abonniert hat (laufender Zugriff), neueste zuerst.
 *
 * Blättern: `before` = `publishedAt ?? createdAt` des letzten Posts der vorigen Seite (exklusiv).
 * Mit `beforeId` (= dessen `id`) gehen auch Posts mit identischem Zeitstempel nicht verloren –
 * ohne `beforeId` werden gleichzeitige Posts an der Seitengrenze übersprungen.
 */
export async function getFeed(
  viewer: Viewer,
  input: { limit?: number; before?: Date; beforeId?: string } = {},
  opts: Opts = {},
): Promise<PostView[]> {
  assertActive(viewer);
  const now = opts.now ?? new Date();
  const limit = clampLimit(input.limit, FEED_DEFAULT_LIMIT, FEED_MAX_LIMIT);
  const cursor = feedCursorCondition(input.before, input.beforeId);
  const db = getDb();

  const subs = await db
    .selectDistinct({ creatorId: subscriptions.creatorId })
    .from(subscriptions)
    .where(and(eq(subscriptions.fanId, viewer.id), activeSubscriptionCondition(now)));
  const creatorIds = subs.map((s) => s.creatorId);
  if (creatorIds.length === 0) return [];

  const rows = await db
    .select({ post: posts })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.creatorId))
    .innerJoin(creatorProfiles, eq(creatorProfiles.userId, posts.creatorId))
    .where(
      and(
        inArray(posts.creatorId, creatorIds),
        eq(posts.moderationStatus, "approved"),
        isNull(posts.deletedAt),
        eq(users.status, "active"),
        isNull(users.deletedAt),
        eq(creatorProfiles.verificationStatus, "approved"),
        cursor,
      ),
    )
    .orderBy(desc(sortTime), desc(posts.id))
    .limit(limit);

  const feedPosts = rows.map((r) => r.post);
  return buildPostViews(db, accessIdentity(viewer), feedPosts, now, { subscribedCreatorIds: new Set(creatorIds) });
}

/** Eigene Posts fürs Studio (jeder Moderationsstatus, ohne gelöschte), neueste zuerst. */
export async function listMyPosts(viewer: Viewer, opts: Opts = {}): Promise<PostView[]> {
  assertCreator(viewer);
  const now = opts.now ?? new Date();
  const db = getDb();
  const rows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.creatorId, viewer.id), isNull(posts.deletedAt)))
    .orderBy(desc(posts.createdAt), desc(posts.id));
  return buildPostViews(db, accessIdentity(viewer), rows, now);
}

// ─── Schreiben ────────────────────────────────────────────────────────────────

type UploadFile = { bytes: Buffer; name: string; type: string };

function validatePostInput(input: { caption: string; visibility: PostVisibility; files: UploadFile[] }): {
  caption: string;
  visibility: PostVisibility;
  files: UploadFile[];
} {
  const fieldErrors: FieldErrors = {};
  const caption = typeof input.caption === "string" ? input.caption.replaceAll("\u0000", "").trim() : "";
  if (caption.length > POST_LIMITS.maxCaptionLength) {
    fieldErrors.caption = [`Der Text darf höchstens ${POST_LIMITS.maxCaptionLength} Zeichen lang sein.`];
  }
  if (!VISIBILITIES.includes(input.visibility)) {
    fieldErrors.visibility = ["Bitte wähle, wer den Post sehen darf."];
  }

  const files = Array.isArray(input.files) ? input.files : [];
  const allowedTypes: readonly string[] = POST_LIMITS.allowedMimeTypes;
  if (files.length < POST_LIMITS.minImages || files.length > POST_LIMITS.maxImages) {
    fieldErrors.files = [`Bitte wähle ${POST_LIMITS.minImages} bis ${POST_LIMITS.maxImages} Bilder aus.`];
  } else if (files.some((f) => !allowedTypes.includes(f.type))) {
    fieldErrors.files = ["Bitte lade nur JPEG-, PNG- oder WebP-Bilder hoch."];
  } else if (files.some((f) => !Buffer.isBuffer(f.bytes) || f.bytes.length > POST_LIMITS.maxImageBytes)) {
    fieldErrors.files = [`Ein Bild darf höchstens ${POST_LIMITS.maxImageBytes / (1024 * 1024)} MB gross sein.`];
  }

  const messages = Object.values(fieldErrors).flat();
  if (messages.length > 0) throw new ValidationError(messages[0], fieldErrors);
  return { caption, visibility: input.visibility, files };
}

async function removeQuietly(storage: MediaStorage, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await storage.remove(keys);
  } catch (error) {
    console.error("[posts] Hochgeladene Medien konnten nicht entfernt werden", { keys, error });
  }
}

/**
 * Neuer Post eines freigegebenen Creators. Bilder werden nacheinander verarbeitet (EXIF weg, Original
 * normalisiert, verpixelte Vorschau) und hochgeladen; Post und Medien landen in einer Transaktion.
 * Schlägt irgendetwas fehl, werden alle bereits hochgeladenen Objekte wieder entfernt.
 * Vorab-Prüfung: solange weniger als `premoderationCount` Posts freigegeben sind, startet der Post `pending`.
 */
export async function createPost(
  viewer: Viewer,
  input: { caption: string; visibility: PostVisibility; files: UploadFile[] },
  opts: Opts = {},
): Promise<{ postId: string; moderationStatus: "pending" | "approved" }> {
  assertApprovedCreator(viewer);
  const now = opts.now ?? new Date();
  const { caption, visibility, files } = validatePostInput(input);

  const storage = getMediaStorage();
  const postId = randomUUID();
  const uploaded: string[] = [];
  try {
    const media: (typeof postMedia.$inferInsert)[] = [];
    for (const [position, file] of files.entries()) {
      const { original, preview } = await processUpload({ bytes: file.bytes });
      const { originalKey, previewKey } = mediaKeys(postId, position);
      // Vor dem Upload merken: auch ein halb geschriebenes Objekt wird beim Aufräumen entfernt.
      uploaded.push(originalKey);
      await storage.put(originalKey, original.data, original.contentType);
      uploaded.push(previewKey);
      await storage.put(previewKey, preview.data, preview.contentType);
      media.push({
        postId,
        position,
        originalKey,
        previewKey,
        width: original.width,
        height: original.height,
        mimeType: original.contentType,
        bytes: original.bytes,
        createdAt: now,
      });
    }

    const moderationStatus = await getDb().transaction(async (tx) => {
      const [{ approvedCount }] = await tx
        .select({ approvedCount: sql<number>`count(*)::int` })
        .from(posts)
        .where(and(eq(posts.creatorId, viewer.id), eq(posts.moderationStatus, "approved"), isNull(posts.deletedAt)));
      const settings = await getPlatformSettings(tx);
      const status = initialModerationStatus(Number(approvedCount), settings.premoderationCount);
      await tx.insert(posts).values({
        id: postId,
        creatorId: viewer.id,
        caption,
        visibility,
        moderationStatus: status,
        publishedAt: status === "approved" ? now : null,
        createdAt: now,
      });
      await tx.insert(postMedia).values(media);
      return status;
    });

    return { postId, moderationStatus };
  } catch (error) {
    await removeQuietly(storage, uploaded);
    throw error;
  }
}

/** Weiches Löschen durch den Eigentümer. Medien bleiben (Moderation/Nachweis) im Speicher. */
export async function deletePost(viewer: Viewer, postId: string, opts: Opts = {}): Promise<void> {
  assertActive(viewer);
  const now = opts.now ?? new Date();
  if (!isUuid(postId)) throw new NotFoundError(POST_NOT_FOUND);
  const db = getDb();

  const [post] = await db
    .select({ creatorId: posts.creatorId, deletedAt: posts.deletedAt })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  if (!post || post.deletedAt) throw new NotFoundError(POST_NOT_FOUND);
  if (post.creatorId !== viewer.id) throw new ForbiddenError("Du kannst nur deine eigenen Posts löschen.");

  await db
    .update(posts)
    .set({ deletedAt: now })
    .where(and(eq(posts.id, postId), eq(posts.creatorId, viewer.id), isNull(posts.deletedAt)));
}

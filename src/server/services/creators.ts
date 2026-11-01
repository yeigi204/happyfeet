import "server-only";

import { and, asc, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { HANDLE_PATTERN, normalizeHandle } from "@/lib/domain/handles";
import { validateMonthlyPrice } from "@/lib/domain/pricing";
import type { PlatformSettings, Viewer } from "@/lib/domain/types";
import { assertAuthenticated, assertCreator, assertOnboarded } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { creatorProfiles, posts, subscriptions, users, type CreatorProfile } from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError, zodFieldErrors } from "@/server/errors";
import { signMediaUrls } from "@/server/storage";

import { writeAudit } from "./audit";
import {
  accessIdentity,
  activeSubscriptionCondition,
  clampLimit,
  isCreatorHidden,
  isPremiumSql,
  listCreatorPosts,
  type PostView,
} from "./posts";
import { getPlatformSettings } from "./settings";

export type CreatorCard = {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  monthlyPriceRappen: number;
  isPremium: boolean;
  /** Fans mit laufendem Zugriff (`active|canceled`, Periode läuft noch). */
  subscriberCount: number;
  /** Freigegebene, nicht gelöschte Posts. */
  postCount: number;
};

export type CreatorPageData = {
  /** Karte plus Banner (nur auf der Profilseite). */
  creator: CreatorCard & { bannerUrl: string | null };
  viewerRelation: {
    isOwner: boolean;
    isSubscribed: boolean;
    subscription: { id: string; currentPeriodEnd: Date; cancelAtPeriodEnd: boolean } | null;
  };
  posts: PostView[];
};

export const CREATOR_BIO_MAX_LENGTH = 1000;

type Opts = { now?: Date };

const EXPLORE_DEFAULT_LIMIT = 30;
const EXPLORE_MAX_LIMIT = 100;
const SEARCH_MAX_LENGTH = 64;

// ─── Validierung ──────────────────────────────────────────────────────────────

const bioSchema = z
  .string({ error: "Bitte gib eine Bio ein." })
  .transform((s) => s.replaceAll("\u0000", "").trim())
  .pipe(z.string().max(CREATOR_BIO_MAX_LENGTH, `Deine Bio darf höchstens ${CREATOR_BIO_MAX_LENGTH} Zeichen haben.`));

function priceSchema(settings: PlatformSettings) {
  return z.number({ error: "Bitte gib einen gültigen Preis ein." }).superRefine((rappen, ctx) => {
    const result = validateMonthlyPrice(rappen, settings);
    if (!result.ok) ctx.addIssue({ code: "custom", message: result.reason });
  });
}

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Bitte prüfe deine Angaben.", zodFieldErrors(parsed.error.issues));
  }
  return parsed.data;
}

// ─── Bewerbung & eigenes Profil ───────────────────────────────────────────────

/**
 * Bewerbung als Creator: legt das Profil im Status `pending` an (Admin-Freigabe folgt).
 * Nach einer Ablehnung darf man sich erneut bewerben; sonst `ConflictError`.
 */
export async function applyAsCreator(
  viewer: Viewer,
  input: { bio: string; monthlyPriceRappen: number },
  opts: Opts = {},
): Promise<CreatorProfile> {
  assertOnboarded(viewer);
  const now = opts.now ?? new Date();
  const db = getDb();
  const settings = await getPlatformSettings(db);
  const { bio, monthlyPriceRappen } = parseOrThrow(
    z.object({ bio: bioSchema, monthlyPriceRappen: priceSchema(settings) }),
    input,
  );

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ status: creatorProfiles.verificationStatus })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, viewer.id))
      .limit(1);

    let profile: CreatorProfile | undefined;
    if (!existing) {
      [profile] = await tx
        .insert(creatorProfiles)
        .values({
          userId: viewer.id,
          bio,
          monthlyPriceRappen,
          verificationStatus: "pending",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();
    } else if (existing.status === "rejected") {
      [profile] = await tx
        .update(creatorProfiles)
        .set({
          bio,
          monthlyPriceRappen,
          verificationStatus: "pending",
          verificationNote: null,
          verifiedAt: null,
          verifiedBy: null,
          updatedAt: now,
        })
        .where(and(eq(creatorProfiles.userId, viewer.id), eq(creatorProfiles.verificationStatus, "rejected")))
        .returning();
    }
    if (!profile) {
      throw new ConflictError(
        existing?.status === "approved"
          ? "Du bist bereits als Creator freigeschaltet."
          : "Deine Bewerbung ist schon eingegangen und wird geprüft.",
      );
    }

    await writeAudit(
      {
        actorId: viewer.id,
        action: "creator.applied",
        targetType: "creator",
        targetId: viewer.id,
        metadata: { monthlyPriceRappen, reapplied: existing !== undefined },
      },
      tx,
    );
    return profile;
  });
}

/** Bio und/oder Monatspreis ändern (gilt für neue Abos; bestehende behalten ihren Preis-Snapshot). */
export async function updateCreatorProfile(
  viewer: Viewer,
  input: { bio?: string; monthlyPriceRappen?: number },
  opts: Opts = {},
): Promise<CreatorProfile> {
  assertCreator(viewer);
  const now = opts.now ?? new Date();
  const db = getDb();
  const settings = await getPlatformSettings(db);
  const patch = parseOrThrow(
    z.object({ bio: bioSchema.optional(), monthlyPriceRappen: priceSchema(settings).optional() }),
    input,
  );

  const changes: Partial<typeof creatorProfiles.$inferInsert> = {};
  if (patch.bio !== undefined) changes.bio = patch.bio;
  if (patch.monthlyPriceRappen !== undefined) changes.monthlyPriceRappen = patch.monthlyPriceRappen;

  const [profile] =
    Object.keys(changes).length === 0
      ? await db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, viewer.id)).limit(1)
      : await db
          .update(creatorProfiles)
          .set({ ...changes, updatedAt: now })
          .where(eq(creatorProfiles.userId, viewer.id))
          .returning();
  if (!profile) throw new NotFoundError("Dein Creator-Profil wurde nicht gefunden.");
  return profile;
}

export async function getMyCreatorProfile(viewer: Viewer): Promise<CreatorProfile | null> {
  assertAuthenticated(viewer);
  const [profile] = await getDb()
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, viewer.id))
    .limit(1);
  return profile ?? null;
}

// ─── Karten (Explore & Profil) ────────────────────────────────────────────────

function cardFields(now: Date) {
  return {
    userId: users.id,
    handle: users.handle,
    displayName: users.displayName,
    avatarKey: users.avatarKey,
    status: users.status,
    bio: creatorProfiles.bio,
    bannerKey: creatorProfiles.bannerKey,
    monthlyPriceRappen: creatorProfiles.monthlyPriceRappen,
    verificationStatus: creatorProfiles.verificationStatus,
    isPremium: isPremiumSql(users.id, now),
    subscriberCount: sql<number>`(select count(*)::int from ${subscriptions} where ${and(
      eq(subscriptions.creatorId, users.id),
      activeSubscriptionCondition(now),
    )})`,
    postCount: sql<number>`(select count(*)::int from ${posts} where ${and(
      eq(posts.creatorId, users.id),
      eq(posts.moderationStatus, "approved"),
      isNull(posts.deletedAt),
    )})`,
  };
}

type CardRow = {
  userId: string;
  handle: string | null;
  displayName: string | null;
  avatarKey: string | null;
  bio: string;
  monthlyPriceRappen: number;
  isPremium: boolean;
  subscriberCount: number;
  postCount: number;
};

function toCard(row: CardRow, urls: Map<string, string>): CreatorCard {
  return {
    userId: row.userId,
    handle: row.handle ?? "",
    displayName: row.displayName ?? row.handle ?? "",
    avatarUrl: row.avatarKey ? (urls.get(row.avatarKey) ?? null) : null,
    bio: row.bio,
    monthlyPriceRappen: row.monthlyPriceRappen,
    isPremium: Boolean(row.isPremium),
    subscriberCount: Number(row.subscriberCount),
    postCount: Number(row.postCount),
  };
}

function nonNull(values: (string | null)[]): string[] {
  return values.filter((v): v is string => v !== null);
}

/** `\`, `%` und `_` sind in LIKE-Mustern Sonderzeichen. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Creator-Liste für Explore: nur freigegebene, aktive Creator. Premium-Boost: Premium zuerst,
 * dann nach Abonnenten absteigend, dann neueste. Enthält keinerlei Post-Medien.
 */
export async function listCreatorsForExplore(
  viewer: Viewer | null,
  input: { query?: string; limit?: number } = {},
  opts: Opts = {},
): Promise<CreatorCard[]> {
  const now = opts.now ?? new Date();
  const limit = clampLimit(input.limit, EXPLORE_DEFAULT_LIMIT, EXPLORE_MAX_LIMIT);
  const query = (input.query ?? "").trim().replace(/^@/, "").slice(0, SEARCH_MAX_LENGTH).trim();

  const conditions: (SQL | undefined)[] = [
    eq(creatorProfiles.verificationStatus, "approved"),
    eq(users.status, "active"),
    isNotNull(users.handle),
  ];
  if (query) {
    const pattern = `%${escapeLike(query)}%`;
    conditions.push(or(ilike(users.handle, pattern), ilike(users.displayName, pattern)));
  }

  const fields = cardFields(now);
  const rows = await getDb()
    .select(fields)
    .from(users)
    .innerJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(fields.isPremium), desc(fields.subscriberCount), desc(creatorProfiles.createdAt), asc(users.id))
    .limit(limit);

  const urls = await signMediaUrls(nonNull(rows.map((r) => r.avatarKey)));
  return rows.map((row) => toCard(row, urls));
}

/**
 * Profilseite `/c/[handle]` (Handle ohne Gross-/Kleinschreibung, `@` erlaubt).
 * `null`, wenn unbekannt, ohne Creator-Profil, nicht freigegeben (ausser Eigentümer/Admin)
 * oder gesperrt (ausser Admin – auch der gesperrte Eigentümer bekommt `null`).
 */
export async function getCreatorPage(
  viewer: Viewer | null,
  handle: string,
  opts: Opts = {},
): Promise<CreatorPageData | null> {
  const now = opts.now ?? new Date();
  const normalized = normalizeHandle(handle);
  if (!HANDLE_PATTERN.test(normalized)) return null;
  const identity = accessIdentity(viewer);
  const db = getDb();

  const [row] = await db
    .select(cardFields(now))
    .from(users)
    .innerJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
    .where(eq(users.handle, normalized))
    .limit(1);
  if (!row) return null;

  const isOwner = identity !== null && identity.id === row.userId;
  const isAdmin = identity !== null && identity.isAdmin;
  if (row.status !== "active" && !isAdmin) return null;
  if (isCreatorHidden(row.status, row.verificationStatus) && !isOwner && !isAdmin) return null;

  const [subscription] =
    identity && !isOwner
      ? await db
          .select({
            id: subscriptions.id,
            currentPeriodEnd: subscriptions.currentPeriodEnd,
            cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
          })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.fanId, identity.id),
              eq(subscriptions.creatorId, row.userId),
              activeSubscriptionCondition(now),
            ),
          )
          .orderBy(desc(subscriptions.currentPeriodEnd))
          .limit(1)
      : [];

  const [urls, postViews] = await Promise.all([
    signMediaUrls(nonNull([row.avatarKey, row.bannerKey])),
    listCreatorPosts(viewer, row.userId, { now }),
  ]);

  return {
    creator: { ...toCard(row, urls), bannerUrl: row.bannerKey ? (urls.get(row.bannerKey) ?? null) : null },
    viewerRelation: {
      isOwner,
      isSubscribed: subscription !== undefined,
      subscription:
        subscription?.currentPeriodEnd
          ? {
              id: subscription.id,
              currentPeriodEnd: subscription.currentPeriodEnd,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            }
          : null,
    },
    posts: postViews,
  };
}

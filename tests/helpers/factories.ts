/**
 * Test-Factories. Schreiben direkt über Drizzle (ohne Services), damit Tests gezielt Zustände herstellen können.
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { Viewer } from "@/lib/domain/types";
import type { Db } from "@/server/db/client";
import {
  creatorProfiles,
  postMedia,
  posts,
  premiumSubscriptions,
  subscriptions,
  users,
  type CreatorProfile,
  type Post,
  type PremiumSubscription,
  type Subscription,
  type User,
} from "@/server/db/schema";

let seq = 0;
const next = () => ++seq;

const DAY = 24 * 60 * 60 * 1000;

export async function createUser(db: Db, overrides: Partial<typeof users.$inferInsert> = {}): Promise<User> {
  const n = next();
  const [row] = await db
    .insert(users)
    .values({
      clerkId: `user_test_${n}_${randomUUID().slice(0, 8)}`,
      email: `user${n}@example.ch`,
      handle: `user_${n}`,
      displayName: `Test User ${n}`,
      birthDate: "1990-05-15",
      ageConfirmedAt: new Date(),
      onboardedAt: new Date(),
      ...overrides,
    })
    .returning();
  return row;
}

export async function createAdmin(db: Db, overrides: Partial<typeof users.$inferInsert> = {}): Promise<User> {
  return createUser(db, { isAdmin: true, ...overrides });
}

export async function createCreator(
  db: Db,
  opts: {
    user?: Partial<typeof users.$inferInsert>;
    profile?: Partial<typeof creatorProfiles.$inferInsert>;
  } = {},
): Promise<{ user: User; profile: CreatorProfile }> {
  const user = await createUser(db, opts.user);
  const [profile] = await db
    .insert(creatorProfiles)
    .values({
      userId: user.id,
      bio: "Gepflegte Füsse aus Zürich.",
      monthlyPriceRappen: 990,
      verificationStatus: "approved",
      verifiedAt: new Date(),
      ...opts.profile,
    })
    .returning();
  return { user, profile };
}

export async function makePremium(
  db: Db,
  creatorId: string,
  opts: { now?: Date; days?: number } = {},
): Promise<PremiumSubscription> {
  const now = opts.now ?? new Date();
  const [row] = await db
    .insert(premiumSubscriptions)
    .values({
      creatorId,
      status: "active",
      priceRappen: 1900,
      currentPeriodStart: new Date(now.getTime() - DAY),
      currentPeriodEnd: new Date(now.getTime() + (opts.days ?? 29) * DAY),
      provider: "mock",
      providerRef: `prem_${randomUUID()}`,
    })
    .returning();
  return row;
}

export async function createPost(
  db: Db,
  creatorId: string,
  overrides: Partial<typeof posts.$inferInsert> & { mediaCount?: number } = {},
): Promise<Post> {
  const { mediaCount = 1, ...postOverrides } = overrides;
  const [post] = await db
    .insert(posts)
    .values({
      creatorId,
      caption: "Sonntag am See",
      visibility: "subscribers",
      moderationStatus: "approved",
      publishedAt: new Date(),
      ...postOverrides,
    })
    .returning();
  for (let i = 0; i < mediaCount; i++) {
    await db.insert(postMedia).values({
      postId: post.id,
      position: i,
      originalKey: `posts/${post.id}/${i}-original.webp`,
      previewKey: `posts/${post.id}/${i}-preview.webp`,
      width: 1200,
      height: 1600,
      mimeType: "image/webp",
      bytes: 123_456,
    });
  }
  return post;
}

export async function createActiveSubscription(
  db: Db,
  fanId: string,
  creatorId: string,
  overrides: Partial<typeof subscriptions.$inferInsert> = {},
): Promise<Subscription> {
  const now = new Date();
  const [row] = await db
    .insert(subscriptions)
    .values({
      fanId,
      creatorId,
      status: "active",
      priceRappen: 990,
      currentPeriodStart: new Date(now.getTime() - DAY),
      currentPeriodEnd: new Date(now.getTime() + 29 * DAY),
      provider: "mock",
      providerRef: `sub_${randomUUID()}`,
      ...overrides,
    })
    .returning();
  return row;
}

/** Baut einen Viewer aus der DB (wie src/server/auth/viewer.ts, aber ohne Clerk). */
export async function viewerFor(db: Db, userId: string, now: Date = new Date()): Promise<Viewer> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error(`viewerFor: User ${userId} nicht gefunden`);
  const [profile] = await db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId)).limit(1);
  const premiums = await db.select().from(premiumSubscriptions).where(eq(premiumSubscriptions.creatorId, userId));
  const isPremium = premiums.some(
    (p) => (p.status === "active" || p.status === "canceled") && p.currentPeriodEnd.getTime() > now.getTime(),
  );
  return {
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    handle: user.handle,
    displayName: user.displayName,
    avatarKey: user.avatarKey,
    isAdmin: user.isAdmin,
    status: user.status,
    onboarded: user.onboardedAt !== null,
    creator: profile ? { verificationStatus: profile.verificationStatus, isPremium } : null,
  };
}

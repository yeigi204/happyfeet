import { describe, expect, it } from "vitest";
import type { ModerationStatus, PostVisibility, ViewerIdentity } from "./types";
import { canViewPostMedia, isPostListed, type PostAccessInput } from "./access";

const CREATOR_ID = "creator-1";
const DELETED_AT = new Date("2026-10-30T12:00:00Z");

const VIEWERS = {
  admin: { id: "admin-1", isAdmin: true },
  owner: { id: CREATOR_ID, isAdmin: false },
  stranger: { id: "fan-1", isAdmin: false },
  anonymous: null,
} satisfies Record<string, ViewerIdentity>;
type ViewerKind = keyof typeof VIEWERS;

const VIEWER_KINDS = Object.keys(VIEWERS) as ViewerKind[];
const VISIBILITIES: PostVisibility[] = ["public", "subscribers"];
const MODERATION: ModerationStatus[] = ["approved", "pending", "rejected", "removed"];
const BOOLS = [false, true] as const;

type Case = {
  viewer: ViewerKind;
  visibility: PostVisibility;
  moderationStatus: ModerationStatus;
  creatorBanned: boolean;
  deleted: boolean;
  hasActiveSubscription: boolean;
};

function input(c: Case): PostAccessInput & { hasActiveSubscription: boolean } {
  return {
    viewer: VIEWERS[c.viewer],
    post: {
      creatorId: CREATOR_ID,
      visibility: c.visibility,
      moderationStatus: c.moderationStatus,
      deletedAt: c.deleted ? DELETED_AT : null,
    },
    creatorBanned: c.creatorBanned,
    hasActiveSubscription: c.hasActiveSubscription,
  };
}

/**
 * Rules from the spec, written as a plain lookup:
 * - Listing: deleted → nobody; admin/owner → everything else; others → only approved posts of non-banned creators.
 * - Media: admin ✓; owner ✓; otherwise only listed posts, and `subscribers` posts only with an active subscription
 *   of a signed-in viewer (an anonymous visitor cannot hold a subscription, whatever flag is passed).
 */
function expected(c: Case): { listed: boolean; media: boolean } {
  const privileged = c.viewer === "admin" || c.viewer === "owner";
  const publiclyVisible = c.moderationStatus === "approved" && !c.creatorBanned && !c.deleted;
  const subscribed = c.viewer !== "anonymous" && c.hasActiveSubscription;
  const listed = !c.deleted && (privileged || publiclyVisible);
  const media = privileged || (publiclyVisible && (c.visibility === "public" || subscribed));
  return { listed, media };
}

const MATRIX: Case[] = VIEWER_KINDS.flatMap((viewer) =>
  VISIBILITIES.flatMap((visibility) =>
    MODERATION.flatMap((moderationStatus) =>
      BOOLS.flatMap((creatorBanned) =>
        BOOLS.flatMap((deleted) =>
          BOOLS.map((hasActiveSubscription) => ({
            viewer,
            visibility,
            moderationStatus,
            creatorBanned,
            deleted,
            hasActiveSubscription,
          })),
        ),
      ),
    ),
  ),
);

function describeCase(c: Case): string {
  return [
    c.viewer,
    c.visibility,
    c.moderationStatus,
    c.creatorBanned ? "creator gesperrt" : "creator aktiv",
    c.deleted ? "gelöscht" : "nicht gelöscht",
    c.hasActiveSubscription ? "mit Abo" : "ohne Abo",
  ].join(" · ");
}

describe("access matrix", () => {
  it("covers every combination", () => {
    expect(MATRIX).toHaveLength(4 * 2 * 4 * 2 * 2 * 2);
  });

  it.each(MATRIX.map((c) => [describeCase(c), c] as const))("%s", (_name, c) => {
    const { listed, media } = expected(c);
    expect({ listed: isPostListed(input(c)), media: canViewPostMedia(input(c)) }).toEqual({
      listed,
      media,
    });
  });
});

describe("isPostListed", () => {
  const base: Case = {
    viewer: "stranger",
    visibility: "subscribers",
    moderationStatus: "approved",
    creatorBanned: false,
    deleted: false,
    hasActiveSubscription: false,
  };

  it("lists approved posts of active creators for everyone, even without subscription", () => {
    expect(isPostListed(input(base))).toBe(true);
    expect(isPostListed(input({ ...base, viewer: "anonymous" }))).toBe(true);
  });

  it("hides pending, rejected and removed posts from strangers", () => {
    for (const moderationStatus of ["pending", "rejected", "removed"] as const) {
      expect(isPostListed(input({ ...base, moderationStatus }))).toBe(false);
    }
  });

  it("shows the owner their own pending and removed posts", () => {
    expect(isPostListed(input({ ...base, viewer: "owner", moderationStatus: "pending" }))).toBe(true);
    expect(isPostListed(input({ ...base, viewer: "owner", moderationStatus: "removed" }))).toBe(true);
  });

  it("hides every post of a banned creator from everyone except admin and owner", () => {
    expect(isPostListed(input({ ...base, creatorBanned: true }))).toBe(false);
    expect(isPostListed(input({ ...base, viewer: "anonymous", creatorBanned: true }))).toBe(false);
    expect(isPostListed(input({ ...base, viewer: "admin", creatorBanned: true }))).toBe(true);
  });

  it("never lists deleted posts, not even for admin or owner", () => {
    for (const viewer of VIEWER_KINDS) {
      expect(isPostListed(input({ ...base, viewer, deleted: true }))).toBe(false);
    }
  });

  it("treats a viewer as owner only by matching id, not by admin flag", () => {
    const otherCreator = { id: "creator-2", isAdmin: false };
    expect(
      isPostListed({
        viewer: otherCreator,
        post: { creatorId: CREATOR_ID, visibility: "public", moderationStatus: "pending", deletedAt: null },
        creatorBanned: false,
      }),
    ).toBe(false);
  });
});

describe("canViewPostMedia", () => {
  const base: Case = {
    viewer: "stranger",
    visibility: "subscribers",
    moderationStatus: "approved",
    creatorBanned: false,
    deleted: false,
    hasActiveSubscription: false,
  };

  it("never reveals subscriber-only media to a viewer without an active subscription", () => {
    expect(canViewPostMedia(input(base))).toBe(false);
    expect(canViewPostMedia(input({ ...base, viewer: "anonymous" }))).toBe(false);
  });

  it("reveals subscriber-only media with an active subscription", () => {
    expect(canViewPostMedia(input({ ...base, hasActiveSubscription: true }))).toBe(true);
  });

  it("never unlocks subscriber-only media for anonymous visitors, even if a subscription flag is passed", () => {
    expect(canViewPostMedia(input({ ...base, viewer: "anonymous", hasActiveSubscription: true }))).toBe(false);
  });

  it("reveals public media to everyone, including anonymous visitors", () => {
    expect(canViewPostMedia(input({ ...base, visibility: "public" }))).toBe(true);
    expect(canViewPostMedia(input({ ...base, viewer: "anonymous", visibility: "public" }))).toBe(true);
  });

  it("does not let a subscription unlock unapproved, deleted or banned content", () => {
    const subscribed = { ...base, hasActiveSubscription: true };
    expect(canViewPostMedia(input({ ...subscribed, moderationStatus: "pending" }))).toBe(false);
    expect(canViewPostMedia(input({ ...subscribed, moderationStatus: "removed" }))).toBe(false);
    expect(canViewPostMedia(input({ ...subscribed, deleted: true }))).toBe(false);
    expect(canViewPostMedia(input({ ...subscribed, creatorBanned: true }))).toBe(false);
  });

  it("always lets admin and owner see the media (moderation and own content)", () => {
    for (const viewer of ["admin", "owner"] as const) {
      expect(canViewPostMedia(input({ ...base, viewer, moderationStatus: "removed" }))).toBe(true);
      expect(canViewPostMedia(input({ ...base, viewer, deleted: true, creatorBanned: true }))).toBe(true);
    }
  });

  it("only grants media to non-privileged viewers on posts that are also listed", () => {
    for (const c of MATRIX) {
      if (c.viewer === "admin" || c.viewer === "owner") continue;
      if (canViewPostMedia(input(c))) expect(isPostListed(input(c))).toBe(true);
    }
  });
});

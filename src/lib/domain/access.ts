import type { ModerationStatus, PostVisibility, ViewerIdentity } from "./types";

export type PostAccessInput = {
  viewer: ViewerIdentity;
  post: {
    creatorId: string;
    visibility: PostVisibility;
    moderationStatus: ModerationStatus;
    deletedAt: Date | null;
  };
  creatorBanned: boolean;
};

function isAdminOrOwner({ viewer, post }: PostAccessInput): boolean {
  return viewer !== null && (viewer.isAdmin || viewer.id === post.creatorId);
}

/** Für alle sichtbar: freigegeben, nicht gelöscht, Creator nicht gesperrt. */
function isPubliclyVisible({ post, creatorBanned }: PostAccessInput): boolean {
  return post.deletedAt === null && post.moderationStatus === "approved" && !creatorBanned;
}

/** Darf der Post in Listen (Profil, Feed, Studio, Moderation) erscheinen? Gelöschte nie. */
export function isPostListed(input: PostAccessInput): boolean {
  if (input.post.deletedAt !== null) return false;
  return isAdminOrOwner(input) || isPubliclyVisible(input);
}

/**
 * Darf der Viewer die Original-Medien sehen? Sonst gibt es nur die verpixelte Vorschau.
 * Admin und Eigentümer immer; alle anderen nur bei sichtbaren Posts, und `subscribers` nur mit aktivem Abo.
 */
export function canViewPostMedia(input: PostAccessInput & { hasActiveSubscription: boolean }): boolean {
  if (isAdminOrOwner(input)) return true;
  if (!isPubliclyVisible(input)) return false;
  return input.post.visibility === "public" || input.hasActiveSubscription;
}

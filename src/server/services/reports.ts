import "server-only";

import { eq } from "drizzle-orm";

import { isPostListed } from "@/lib/domain/access";
import { REPORT_DETAILS_MAX_LENGTH, REPORT_REASONS } from "@/lib/domain/reports";
import type { ReportReason, Viewer } from "@/lib/domain/types";
import { assertOnboarded } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { creatorProfiles, posts, reports, users } from "@/server/db/schema";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError, type FieldErrors } from "@/server/errors";

import { accessIdentity, isCreatorHidden, isUuid } from "./posts";

export { REPORT_DETAILS_MAX_LENGTH };

const POST_NOT_FOUND = "Dieser Post wurde nicht gefunden.";

/**
 * Meldet einen Post. Nur angemeldete, aktive Nutzer mit abgeschlossenem Onboarding; nicht den eigenen Post;
 * nur Posts, die für den Viewer gelistet sind (sonst `NotFoundError`). Pro Nutzer und Post höchstens
 * eine offene Meldung (`ConflictError`).
 */
export async function reportPost(
  viewer: Viewer,
  input: { postId: string; reason: ReportReason; details?: string },
  opts: { now?: Date } = {},
): Promise<{ reportId: string }> {
  assertOnboarded(viewer);
  const now = opts.now ?? new Date();

  const fieldErrors: FieldErrors = {};
  if (typeof input.reason !== "string" || !Object.hasOwn(REPORT_REASONS, input.reason)) {
    fieldErrors.reason = ["Bitte wähle einen Grund für die Meldung."];
  }
  const details = typeof input.details === "string" ? input.details.replaceAll("\u0000", "").trim() : "";
  if (details.length > REPORT_DETAILS_MAX_LENGTH) {
    fieldErrors.details = [`Die Beschreibung darf höchstens ${REPORT_DETAILS_MAX_LENGTH} Zeichen lang sein.`];
  }
  const messages = Object.values(fieldErrors).flat();
  if (messages.length > 0) throw new ValidationError(messages[0], fieldErrors);

  if (!isUuid(input.postId)) throw new NotFoundError(POST_NOT_FOUND);
  const db = getDb();
  const [row] = await db
    .select({
      post: {
        creatorId: posts.creatorId,
        visibility: posts.visibility,
        moderationStatus: posts.moderationStatus,
        deletedAt: posts.deletedAt,
      },
      creatorStatus: users.status,
      creatorDeletedAt: users.deletedAt,
      verificationStatus: creatorProfiles.verificationStatus,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.creatorId))
    .leftJoin(creatorProfiles, eq(creatorProfiles.userId, posts.creatorId))
    .where(eq(posts.id, input.postId))
    .limit(1);

  const listed =
    row !== undefined &&
    isPostListed({
      viewer: accessIdentity(viewer),
      post: row.post,
      creatorBanned: isCreatorHidden(row.creatorStatus, row.verificationStatus, row.creatorDeletedAt),
    });
  if (!row || !listed) throw new NotFoundError(POST_NOT_FOUND);
  if (row.post.creatorId === viewer.id) throw new ForbiddenError("Deinen eigenen Post kannst du nicht melden.");

  // Der partielle Unique-Index (eine offene Meldung pro Nutzer & Post) entscheidet auch bei Doppelklick.
  const [report] = await db
    .insert(reports)
    .values({ postId: input.postId, reporterId: viewer.id, reason: input.reason, details, createdAt: now })
    .onConflictDoNothing()
    .returning({ id: reports.id });
  if (!report) throw new ConflictError("Du hast diesen Post bereits gemeldet – wir schauen ihn uns an.");
  return { reportId: report.id };
}

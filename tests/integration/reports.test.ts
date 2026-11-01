import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { reports } from "@/server/db/schema";
import { AuthError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { reportPost } from "@/server/services/reports";

import { setupTestDb } from "../helpers/db";
import { createAdmin, createCreator, createPost, createUser, viewerFor } from "../helpers/factories";

const t = setupTestDb();

const NOW = new Date();

async function scenario() {
  const { user: creator } = await createCreator(t.db);
  const post = await createPost(t.db, creator.id, { visibility: "subscribers" });
  const fan = await createUser(t.db);
  return { creator, post, fan, viewer: await viewerFor(t.db, fan.id, NOW) };
}

describe("reportPost", () => {
  it("legt eine offene Meldung an – auch für gesperrte (verpixelte) Abo-Posts", async () => {
    const { post, fan, viewer } = await scenario();

    const result = await reportPost(
      viewer,
      { postId: post.id, reason: "possible_minor", details: "  Wirkt sehr jung.  " },
      { now: NOW },
    );

    const rows = await t.db.select().from(reports);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: result.reportId,
      postId: post.id,
      reporterId: fan.id,
      reason: "possible_minor",
      details: "Wirkt sehr jung.",
      status: "open",
    });
    expect(rows[0].createdAt.getTime()).toBe(NOW.getTime());
  });

  it("doppelte offene Meldung → ConflictError; nach Erledigung ist eine neue möglich", async () => {
    const { post, viewer } = await scenario();
    await reportPost(viewer, { postId: post.id, reason: "spam" }, { now: NOW });

    await expect(reportPost(viewer, { postId: post.id, reason: "other" }, { now: NOW })).rejects.toBeInstanceOf(
      ConflictError,
    );

    await t.db.update(reports).set({ status: "dismissed" }).where(eq(reports.postId, post.id));
    await expect(reportPost(viewer, { postId: post.id, reason: "other" }, { now: NOW })).resolves.toBeDefined();
    expect(await t.db.select().from(reports)).toHaveLength(2);
  });

  it("zwei verschiedene Nutzer dürfen denselben Post melden", async () => {
    const { post, viewer } = await scenario();
    const other = await viewerFor(t.db, (await createUser(t.db)).id, NOW);
    await reportPost(viewer, { postId: post.id, reason: "spam" }, { now: NOW });
    await reportPost(other, { postId: post.id, reason: "spam" }, { now: NOW });
    expect(await t.db.select().from(reports)).toHaveLength(2);
  });

  it("gesperrter Fan → ForbiddenError", async () => {
    const { post } = await scenario();
    const banned = await createUser(t.db, { status: "banned", bannedAt: NOW });
    await expect(
      reportPost(await viewerFor(t.db, banned.id, NOW), { postId: post.id, reason: "spam" }, { now: NOW }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await t.db.select().from(reports)).toHaveLength(0);
  });

  it("ohne Onboarding → ForbiddenError, ohne Anmeldung → AuthError", async () => {
    const { post } = await scenario();
    const fresh = await createUser(t.db, { handle: null, displayName: null, onboardedAt: null });
    await expect(
      reportPost(await viewerFor(t.db, fresh.id, NOW), { postId: post.id, reason: "spam" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reportPost(null as never, { postId: post.id, reason: "spam" })).rejects.toBeInstanceOf(AuthError);
  });

  it("eigener Post → ForbiddenError", async () => {
    const { creator, post } = await scenario();
    await expect(
      reportPost(await viewerFor(t.db, creator.id, NOW), { postId: post.id, reason: "spam" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("nicht gelistete Posts (pending, gelöscht, gesperrter Creator, unbekannt) → NotFoundError", async () => {
    const { creator, viewer } = await scenario();
    const pending = await createPost(t.db, creator.id, { moderationStatus: "pending", publishedAt: null });
    const deleted = await createPost(t.db, creator.id, { deletedAt: NOW });
    const { user: banned } = await createCreator(t.db, { user: { status: "banned", bannedAt: NOW } });
    const bannedPost = await createPost(t.db, banned.id, { visibility: "public" });

    for (const postId of [
      pending.id,
      deleted.id,
      bannedPost.id,
      "00000000-0000-0000-0000-000000000000",
      "keine-uuid",
    ]) {
      await expect(reportPost(viewer, { postId, reason: "spam" }, { now: NOW })).rejects.toBeInstanceOf(NotFoundError);
    }
    expect(await t.db.select().from(reports)).toHaveLength(0);
  });

  it("Admin darf auch nicht freigegebene Posts melden (für ihn gelistet)", async () => {
    const { creator } = await scenario();
    const pending = await createPost(t.db, creator.id, { moderationStatus: "pending", publishedAt: null });
    const admin = await createAdmin(t.db);
    await expect(
      reportPost(await viewerFor(t.db, admin.id, NOW), { postId: pending.id, reason: "other" }),
    ).resolves.toBeDefined();
  });

  it("ungültiger Grund oder zu lange Details → ValidationError", async () => {
    const { post, viewer } = await scenario();
    await expect(reportPost(viewer, { postId: post.id, reason: "boring" as never })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      reportPost(viewer, { postId: post.id, reason: "other", details: "x".repeat(2001) }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await t.db.select().from(reports)).toHaveLength(0);
  });
});

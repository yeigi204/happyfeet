import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auditLog, posts, reports } from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import {
  approvePost,
  dismissReport,
  listModerationQueue,
  rejectPost,
  removePost,
  resolveReport,
} from "@/server/services/admin/moderation";
import { setMediaStorageForTesting } from "@/server/storage";
import { InMemoryMediaStorage } from "@/server/storage/memory";

import { setupTestDb } from "../../helpers/db";
import { createAdmin, createCreator, createPost, createUser, makePremium, viewerFor } from "../../helpers/factories";
import { daysBefore, insertReport } from "../../helpers/task9";

const t = setupTestDb();
const NOW = new Date("2026-11-04T10:00:00Z");

beforeAll(() => setMediaStorageForTesting(new InMemoryMediaStorage()));
afterAll(() => setMediaStorageForTesting(null));

async function fixture() {
  const admin = await viewerFor(t.db, (await createAdmin(t.db, { handle: "chefin" })).id, NOW);
  const { user: creator } = await createCreator(t.db, { user: { handle: "zehenspiel", displayName: "Nina" } });
  await makePremium(t.db, creator.id, { now: NOW });
  const { user: other } = await createCreator(t.db, { user: { handle: "lena_barfuss", displayName: "Lena" } });
  const reporter = await createUser(t.db, { handle: "fan_frieda" });
  const reporter2 = await createUser(t.db, { handle: "fan_fritz" });

  // Zwei freigegebene Posts von `creator` → approvedPostCount 2
  const approvedA = await createPost(t.db, creator.id, { createdAt: daysBefore(NOW, 20) });
  const approvedB = await createPost(t.db, creator.id, { createdAt: daysBefore(NOW, 10) });
  const pendingOld = await createPost(t.db, creator.id, {
    moderationStatus: "pending",
    publishedAt: null,
    caption: "Erster Schnee",
    visibility: "public",
    createdAt: daysBefore(NOW, 3),
    mediaCount: 2,
  });
  const pendingNew = await createPost(t.db, other.id, {
    moderationStatus: "pending",
    publishedAt: null,
    createdAt: daysBefore(NOW, 1),
  });
  await createPost(t.db, other.id, { moderationStatus: "pending", publishedAt: null, deletedAt: daysBefore(NOW, 1) });
  const otherApproved = await createPost(t.db, other.id, { createdAt: daysBefore(NOW, 5) });

  const spamOld = await insertReport(t.db, {
    postId: approvedA.id,
    reporterId: reporter.id,
    reason: "spam",
    createdAt: daysBefore(NOW, 6),
  });
  const criticalNew = await insertReport(t.db, {
    postId: approvedB.id,
    reporterId: reporter.id,
    reason: "possible_minor",
    details: "Wirkt sehr jung.",
    createdAt: daysBefore(NOW, 1),
  });
  const criticalOld = await insertReport(t.db, {
    postId: otherApproved.id,
    reporterId: null,
    reason: "non_consensual",
    createdAt: daysBefore(NOW, 2),
  });
  const secondOnA = await insertReport(t.db, {
    postId: approvedA.id,
    reporterId: reporter2.id,
    reason: "not_own_content",
    createdAt: daysBefore(NOW, 4),
  });
  await insertReport(t.db, {
    postId: approvedA.id,
    reporterId: reporter2.id,
    reason: "other",
    status: "dismissed",
    createdAt: daysBefore(NOW, 30),
  });

  return {
    admin,
    creator,
    other,
    approvedA,
    approvedB,
    pendingOld,
    pendingNew,
    otherApproved,
    spamOld,
    criticalNew,
    criticalOld,
    secondOnA,
  };
}

describe("listModerationQueue", () => {
  it("liefert wartende Posts (älteste zuerst) mit signierten Originalen", async () => {
    const f = await fixture();

    const { pendingPosts } = await listModerationQueue(f.admin, { now: NOW });

    expect(pendingPosts.map((p) => p.id)).toEqual([f.pendingOld.id, f.pendingNew.id]);
    const first = pendingPosts[0];
    expect(first).toMatchObject({
      id: f.pendingOld.id,
      caption: "Erster Schnee",
      visibility: "public",
      moderationStatus: "pending",
      creator: { userId: f.creator.id, handle: "zehenspiel", displayName: "Nina", isPremium: true, approvedPostCount: 2 },
    });
    expect(first.createdAt).toEqual(daysBefore(NOW, 3));
    expect(first.media).toHaveLength(2);
    expect(first.media[0].url).toMatch(new RegExp(`^memory://posts/${f.pendingOld.id}/0-original\\.webp\\?exp=`));
    expect(first.media[1].url).toContain("1-original.webp");
    expect(first.media[0]).toMatchObject({ width: 1200, height: 1600 });
    expect(pendingPosts[1].creator).toMatchObject({ handle: "lena_barfuss", isPremium: false, approvedPostCount: 1 });
  });

  it("liefert offene Meldungen: kritische zuerst, dann älteste", async () => {
    const f = await fixture();

    const { openReports } = await listModerationQueue(f.admin, { now: NOW });

    expect(openReports.map((r) => r.id)).toEqual([f.criticalOld.id, f.criticalNew.id, f.spamOld.id, f.secondOnA.id]);
    const critical = openReports[1];
    expect(critical).toMatchObject({
      reason: "possible_minor",
      severity: "critical",
      details: "Wirkt sehr jung.",
      reporter: { handle: "fan_frieda" },
      openReportsOnPost: 1,
      post: { id: f.approvedB.id, moderationStatus: "approved", creator: { handle: "zehenspiel" } },
    });
    expect(critical.post.media[0].url).toContain("-original.webp");
    expect(openReports[0].reporter).toBeNull();
    expect(openReports[2]).toMatchObject({ severity: "normal", openReportsOnPost: 2 });
    expect(openReports[3]).toMatchObject({ severity: "high", openReportsOnPost: 2 });
  });
});

describe("approvePost / rejectPost", () => {
  it("approvePost gibt frei, setzt publishedAt und schreibt ein Audit", async () => {
    const f = await fixture();

    await approvePost(f.admin, f.pendingOld.id, { now: NOW });

    const [row] = await t.db.select().from(posts).where(eq(posts.id, f.pendingOld.id));
    expect(row).toMatchObject({ moderationStatus: "approved", moderatedBy: f.admin.id, moderationNote: null });
    expect(row.moderatedAt).toEqual(NOW);
    expect(row.publishedAt).toEqual(NOW);
    const [audit] = await t.db.select().from(auditLog);
    expect(audit).toMatchObject({ action: "post.approved", targetType: "post", targetId: f.pendingOld.id });
  });

  it("approvePost nur für wartende Posts; unbekannte → NotFoundError", async () => {
    const f = await fixture();
    await expect(approvePost(f.admin, f.approvedA.id, { now: NOW })).rejects.toBeInstanceOf(ConflictError);
    await expect(approvePost(f.admin, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(NotFoundError);
    await expect(approvePost(f.admin, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejectPost verlangt eine Notiz und setzt sie", async () => {
    const f = await fixture();

    await expect(rejectPost(f.admin, f.pendingNew.id, " ", { now: NOW })).rejects.toBeInstanceOf(ValidationError);
    await rejectPost(f.admin, f.pendingNew.id, "Gesicht erkennbar – bitte zuschneiden.", { now: NOW });

    const [row] = await t.db.select().from(posts).where(eq(posts.id, f.pendingNew.id));
    expect(row).toMatchObject({
      moderationStatus: "rejected",
      moderationNote: "Gesicht erkennbar – bitte zuschneiden.",
      moderatedBy: f.admin.id,
      publishedAt: null,
    });
    const audit = await t.db.select().from(auditLog);
    expect(audit.map((a) => a.action)).toEqual(["post.rejected"]);
  });
});

describe("removePost", () => {
  it("entfernt den Post und löst alle offenen Meldungen dazu", async () => {
    const f = await fixture();

    await removePost(f.admin, f.approvedA.id, "Spam-Account", { now: NOW });

    const [row] = await t.db.select().from(posts).where(eq(posts.id, f.approvedA.id));
    expect(row).toMatchObject({ moderationStatus: "removed", moderationNote: "Spam-Account", moderatedBy: f.admin.id });

    const onPost = await t.db.select().from(reports).where(eq(reports.postId, f.approvedA.id));
    const byId = new Map(onPost.map((r) => [r.id, r]));
    expect(byId.get(f.spamOld.id)).toMatchObject({ status: "resolved", resolvedBy: f.admin.id, resolutionNote: "Spam-Account" });
    expect(byId.get(f.secondOnA.id)?.status).toBe("resolved");
    expect(byId.get(f.secondOnA.id)?.resolvedAt).toEqual(NOW);
    // bereits verworfene Meldung bleibt verworfen
    expect(onPost.filter((r) => r.status === "dismissed")).toHaveLength(1);

    // Meldungen zu anderen Posts bleiben offen
    const [other] = await t.db.select().from(reports).where(eq(reports.id, f.criticalNew.id));
    expect(other.status).toBe("open");

    const audit = await t.db.select().from(auditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "post.removed", targetId: f.approvedA.id });
    expect(audit[0].metadata).toMatchObject({ note: "Spam-Account", resolvedReports: 2 });

    const { openReports } = await listModerationQueue(f.admin, { now: NOW });
    expect(openReports.map((r) => r.post.id)).not.toContain(f.approvedA.id);
  });

  it("verlangt eine Notiz", async () => {
    const f = await fixture();
    await expect(removePost(f.admin, f.approvedA.id, "", { now: NOW })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("resolveReport / dismissReport", () => {
  it("setzen den Status, schreiben ein Audit und gehen nur für offene Meldungen", async () => {
    const f = await fixture();

    await resolveReport(f.admin, f.criticalOld.id, "Creator kontaktiert", { now: NOW });
    await dismissReport(f.admin, f.spamOld.id, undefined, { now: NOW });

    const [resolved] = await t.db.select().from(reports).where(eq(reports.id, f.criticalOld.id));
    expect(resolved).toMatchObject({ status: "resolved", resolutionNote: "Creator kontaktiert", resolvedBy: f.admin.id });
    expect(resolved.resolvedAt).toEqual(NOW);
    const [dismissed] = await t.db.select().from(reports).where(eq(reports.id, f.spamOld.id));
    expect(dismissed).toMatchObject({ status: "dismissed", resolutionNote: null, resolvedBy: f.admin.id });

    const audit = await t.db.select().from(auditLog);
    expect(audit.map((a) => a.action).sort()).toEqual(["report.dismissed", "report.resolved"]);

    await expect(resolveReport(f.admin, f.spamOld.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(dismissReport(f.admin, f.criticalOld.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(dismissReport(f.admin, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(NotFoundError);
  });
});

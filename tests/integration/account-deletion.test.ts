/**
 * Clerk `user.deleted`: Konto wird anonymisiert statt hart gelöscht. Moderations-Nachweise
 * (Posts, Meldungen) und Geldflüsse (Zahlungen, Auszahlungen) bleiben dem Creator zugeordnet,
 * eine Sperre überlebt die Löschung.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  auditLog,
  payments,
  payouts,
  postMedia,
  posts,
  premiumSubscriptions,
  reports,
  subscriptions,
  users,
} from "@/server/db/schema";
import { NotFoundError } from "@/server/errors";
import { getCreatorPage, listCreatorsForExplore } from "@/server/services/creators";
import { generateDuePayouts } from "@/server/services/payouts";
import { getFeed } from "@/server/services/posts";
import { startSubscriptionCheckout } from "@/server/services/subscriptions";
import { deleteUserByClerkId, findViewerByClerkId, upsertUserFromClerk } from "@/server/services/users";
import { setMediaStorageForTesting } from "@/server/storage";
import { InMemoryMediaStorage } from "@/server/storage/memory";

import { setupTestDb } from "../helpers/db";
import {
  createActiveSubscription,
  createAdmin,
  createCreator,
  createPost,
  createUser,
  makePremium,
  viewerFor,
} from "../helpers/factories";

const t = setupTestDb();

const DAY = 24 * 60 * 60 * 1000;

beforeAll(() => {
  setMediaStorageForTesting(new InMemoryMediaStorage());
});

afterAll(() => {
  setMediaStorageForTesting(null);
});

let paymentSeq = 0;

async function insertFanPayment(fanId: string, creatorId: string, subscriptionId: string, createdAt: Date) {
  paymentSeq += 1;
  const [row] = await t.db
    .insert(payments)
    .values({
      kind: "fan_subscription",
      subscriptionId,
      payerId: fanId,
      creatorId,
      grossRappen: 990,
      feeBps: 1500,
      platformFeeRappen: 149,
      creatorNetRappen: 841,
      creatorPlan: "standard",
      provider: "mock",
      providerPaymentId: `pay_del_${paymentSeq}`,
      createdAt,
    })
    .returning();
  return row;
}

/** Creator mit Post (+ offener kritischer Meldung), Fan-Abo, Zahlungen und einer bezahlten Auszahlung. */
async function creatorWithHistory(userOverrides: Partial<typeof users.$inferInsert> = {}) {
  const { user: creator } = await createCreator(t.db, {
    user: { clerkId: "user_creator_gone", email: "weg@example.ch", ...userOverrides },
  });
  const fan = await createUser(t.db);
  const admin = await createAdmin(t.db);
  const post = await createPost(t.db, creator.id, { visibility: "public" });
  await t.db.insert(reports).values({ postId: post.id, reporterId: fan.id, reason: "possible_minor" });
  const sub = await createActiveSubscription(t.db, fan.id, creator.id);
  await insertFanPayment(fan.id, creator.id, sub.id, new Date(Date.now() - 40 * DAY));
  await insertFanPayment(fan.id, creator.id, sub.id, new Date(Date.now() - 2 * DAY));
  await t.db.insert(payouts).values({
    creatorId: creator.id,
    amountRappen: 841,
    schedule: "monthly",
    periodStart: new Date(Date.now() - 60 * DAY),
    periodEnd: new Date(Date.now() - 20 * DAY),
    status: "paid",
    paidAt: new Date(Date.now() - 19 * DAY),
    paidBy: admin.id,
  });
  return { creator, fan, admin, post, sub };
}

async function userRow(id: string) {
  const [row] = await t.db.select().from(users).where(eq(users.id, id));
  return row;
}

describe("deleteUserByClerkId (Clerk user.deleted)", () => {
  it("behält Posts, Medien, Meldungen, Zahlungen und Auszahlungen – alles bleibt dem Creator zugeordnet", async () => {
    const { creator, post } = await creatorWithHistory();

    await deleteUserByClerkId("user_creator_gone");

    expect(await t.db.select().from(posts).where(eq(posts.creatorId, creator.id))).toHaveLength(1);
    expect(await t.db.select().from(postMedia).where(eq(postMedia.postId, post.id))).toHaveLength(1);
    expect(await t.db.select().from(reports).where(eq(reports.postId, post.id))).toHaveLength(1);
    expect(await t.db.select().from(payouts).where(eq(payouts.creatorId, creator.id))).toHaveLength(1);
    expect(await t.db.select().from(payments).where(eq(payments.creatorId, creator.id))).toHaveLength(2);
    expect(await t.db.select().from(subscriptions).where(eq(subscriptions.creatorId, creator.id))).toHaveLength(1);
  });

  it("anonymisiert die Zeile: E-Mail und Geburtsdatum weg, deleted_at gesetzt, Sperre bleibt", async () => {
    const { creator } = await creatorWithHistory({ status: "banned", bannedReason: "Illegale Inhalte", bannedAt: new Date() });
    const now = new Date("2026-11-01T12:00:00Z");

    await deleteUserByClerkId("user_creator_gone", { now });

    const row = await userRow(creator.id);
    expect(row).toBeDefined();
    expect(row.email).toBeNull();
    expect(row.birthDate).toBeNull();
    expect(row.deletedAt).toEqual(now);
    expect(row.status).toBe("banned");
    expect(row.bannedReason).toBe("Illegale Inhalte");
  });

  it("beendet die Abrechnung: laufende Abos (als Fan und Creator) und Premium zum Periodenende gekündigt, offene Checkouts verfallen", async () => {
    const { user: creator } = await createCreator(t.db, { user: { clerkId: "user_both" } });
    const { user: other } = await createCreator(t.db);
    const fan = await createUser(t.db);
    const asCreator = await createActiveSubscription(t.db, fan.id, creator.id);
    const asFan = await createActiveSubscription(t.db, creator.id, other.id);
    // Ein lebendes Abo pro Paar (partieller Unique-Index): der offene Checkout gehört einem zweiten Fan.
    const fan2 = await createUser(t.db);
    const [pending] = await t.db
      .insert(subscriptions)
      .values({ fanId: fan2.id, creatorId: creator.id, status: "pending", priceRappen: 990, provider: "mock" })
      .returning();
    const premium = await makePremium(t.db, creator.id);

    await deleteUserByClerkId("user_both");

    const subsById = new Map(
      (await t.db.select().from(subscriptions)).map((s) => [s.id, s] as const),
    );
    expect(subsById.get(asCreator.id)).toMatchObject({ status: "canceled", cancelAtPeriodEnd: true });
    expect(subsById.get(asFan.id)).toMatchObject({ status: "canceled", cancelAtPeriodEnd: true });
    expect(subsById.get(pending.id)?.status).toBe("expired");
    const [prem] = await t.db.select().from(premiumSubscriptions).where(eq(premiumSubscriptions.id, premium.id));
    expect(prem).toMatchObject({ status: "canceled", cancelAtPeriodEnd: true });
  });

  it("protokolliert die Löschung im Audit-Log (ohne E-Mail)", async () => {
    const { creator } = await creatorWithHistory();
    await deleteUserByClerkId("user_creator_gone");
    const entries = await t.db.select().from(auditLog).where(eq(auditLog.targetId, creator.id));
    const deleted = entries.find((e) => e.action === "user.deleted");
    expect(deleted).toBeDefined();
    expect(deleted?.actorId).toBeNull();
    expect(JSON.stringify(deleted?.metadata)).not.toContain("weg@example.ch");
  });

  it("ist idempotent und tut nichts bei unbekannter Clerk-ID", async () => {
    const { creator } = await creatorWithHistory();
    const first = new Date("2026-11-01T12:00:00Z");
    await deleteUserByClerkId("user_creator_gone", { now: first });
    await deleteUserByClerkId("user_creator_gone", { now: new Date("2026-11-02T12:00:00Z") });
    await expect(deleteUserByClerkId("user_unknown")).resolves.toBeUndefined();
    expect((await userRow(creator.id)).deletedAt).toEqual(first);
    const audits = await t.db.select().from(auditLog).where(eq(auditLog.action, "user.deleted"));
    expect(audits).toHaveLength(1);
  });

  it("ein gelöschtes Konto kann nicht mehr handeln: kein Viewer, auch nicht nach einem verspäteten user.updated", async () => {
    await creatorWithHistory();
    await deleteUserByClerkId("user_creator_gone");

    expect(await findViewerByClerkId("user_creator_gone")).toBeNull();
    const again = await upsertUserFromClerk({ clerkId: "user_creator_gone", email: "weg@example.ch" });
    expect(again.email).toBeNull();
    expect(again.deletedAt).not.toBeNull();
    expect(await findViewerByClerkId("user_creator_gone")).toBeNull();
  });

  it("ein gelöschter Creator verschwindet öffentlich (Explore, Profil, Feed, Checkout) – der Admin sieht ihn noch", async () => {
    const { creator, fan, admin } = await creatorWithHistory();
    const fanViewer = await viewerFor(t.db, fan.id);
    const adminViewer = await viewerFor(t.db, admin.id);
    const handle = creator.handle!;

    await deleteUserByClerkId("user_creator_gone");

    expect((await listCreatorsForExplore(null)).map((c) => c.userId)).not.toContain(creator.id);
    expect(await getCreatorPage(null, handle)).toBeNull();
    expect(await getCreatorPage(fanViewer, handle)).toBeNull();
    expect(await getCreatorPage(adminViewer, handle)).not.toBeNull();
    expect(await getFeed(fanViewer)).toHaveLength(0);

    const newFan = await viewerFor(t.db, (await createUser(t.db)).id);
    await expect(startSubscriptionCheckout(newFan, { creatorId: creator.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("erzeugt für gelöschte Creator keine automatische Auszahlung, das Guthaben bleibt zugeordnet", async () => {
    const { creator } = await creatorWithHistory();
    await deleteUserByClerkId("user_creator_gone");
    await generateDuePayouts(null, { now: new Date() });
    const rows = await t.db.select().from(payouts).where(eq(payouts.creatorId, creator.id));
    expect(rows).toHaveLength(1); // nur die alte, bezahlte
    expect(await t.db.select().from(payments).where(eq(payments.creatorId, creator.id))).toHaveLength(2);
  });
});

describe("Neuanmeldung nach Sperre und Löschung", () => {
  it("ein neues Clerk-Konto mit derselben bestätigten E-Mail wie ein gesperrtes, gelöschtes Konto startet gesperrt", async () => {
    await createUser(t.db, {
      clerkId: "user_banned_gone",
      email: "Boese@Example.ch",
      status: "banned",
      bannedReason: "Illegale Inhalte",
      bannedAt: new Date(),
    });
    await deleteUserByClerkId("user_banned_gone");

    const fresh = await upsertUserFromClerk({ clerkId: "user_new_account", email: "boese@example.ch" });
    expect(fresh.status).toBe("banned");
    expect(fresh.bannedReason).toContain("Illegale Inhalte");
    expect(fresh.bannedAt).not.toBeNull();
    const audit = await t.db.select().from(auditLog).where(eq(auditLog.targetId, fresh.id));
    expect(audit.map((a) => a.action)).toContain("user.banned");
  });

  it("greift auch, wenn die E-Mail erst mit einem späteren user.updated bestätigt ankommt", async () => {
    await createUser(t.db, { clerkId: "user_banned_gone", email: "boese@example.ch", status: "banned", bannedAt: new Date() });
    await deleteUserByClerkId("user_banned_gone");

    const first = await upsertUserFromClerk({ clerkId: "user_new_account", email: null });
    expect(first.status).toBe("active");
    const updated = await upsertUserFromClerk({ clerkId: "user_new_account", email: "boese@example.ch" });
    expect(updated.status).toBe("banned");
  });

  it("ein nicht gesperrtes, gelöschtes Konto blockiert eine Neuanmeldung mit derselben E-Mail nicht", async () => {
    await createUser(t.db, { clerkId: "user_nice_gone", email: "nett@example.ch" });
    await deleteUserByClerkId("user_nice_gone");

    const fresh = await upsertUserFromClerk({ clerkId: "user_nice_new", email: "nett@example.ch" });
    expect(fresh.status).toBe("active");
  });
});

describe("Schema-Schutz", () => {
  it("ein hartes DELETE eines Creators mit Auszahlungen und Zahlungen scheitert, statt Nachweise mitzulöschen", async () => {
    const { creator } = await creatorWithHistory();
    await expect(t.db.delete(users).where(eq(users.id, creator.id))).rejects.toThrow();
    expect(await t.db.select().from(payouts).where(eq(payouts.creatorId, creator.id))).toHaveLength(1);
  });
});

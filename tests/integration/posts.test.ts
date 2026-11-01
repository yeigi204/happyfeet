import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { platformSettings, postMedia, posts, type PostMedia } from "@/server/db/schema";
import { AuthError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { getCreatorPage, listCreatorsForExplore } from "@/server/services/creators";
import { mediaViewsFor } from "@/server/services/media-urls";
import {
  createPost,
  deletePost,
  getFeed,
  listCreatorPosts,
  listMyPosts,
  type PostView,
} from "@/server/services/posts";
import { setMediaStorageForTesting } from "@/server/storage";
import { InMemoryMediaStorage } from "@/server/storage/memory";

import { setupTestDb } from "../helpers/db";
import {
  createActiveSubscription,
  createAdmin,
  createCreator,
  createPost as insertPost,
  createUser,
  makePremium,
  viewerFor,
} from "../helpers/factories";
import { FailingMediaStorage, imageFiles, mediaRowsOf, testImage } from "../helpers/task7";

const t = setupTestDb();

const NOW = new Date();
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

let storage: InMemoryMediaStorage;

beforeAll(() => {
  storage = new InMemoryMediaStorage();
  setMediaStorageForTesting(storage);
});

beforeEach(() => {
  storage = new InMemoryMediaStorage();
  setMediaStorageForTesting(storage);
});

afterAll(() => {
  setMediaStorageForTesting(null);
});

async function postRows(creatorId: string) {
  return t.db.select().from(posts).where(eq(posts.creatorId, creatorId));
}

function signedKey(url: string): string {
  expect(url.startsWith("memory://")).toBe(true);
  return url.slice("memory://".length).split("?")[0];
}

// ─── Review Focus 1 ───────────────────────────────────────────────────────────

describe("locked posts never expose original keys", () => {
  async function lockedScenario() {
    const { user: creator } = await createCreator(t.db, { user: { handle: "lena_zh" } });
    const locked1 = await insertPost(t.db, creator.id, { visibility: "subscribers", mediaCount: 3 });
    const locked2 = await insertPost(t.db, creator.id, { visibility: "subscribers", mediaCount: 1 });
    const open = await insertPost(t.db, creator.id, { visibility: "public", mediaCount: 1 });
    const lockedIds = [locked1.id, locked2.id];
    const lockedMedia = await mediaRowsOf(t.db, lockedIds);
    const openMedia = await mediaRowsOf(t.db, [open.id]);
    expect(lockedMedia).toHaveLength(4);
    return { creator, lockedIds, lockedMedia, openId: open.id, openMedia };
  }

  /** Gesperrte Posts liefern ausschliesslich signierte Vorschau-Keys; kein Original-Key taucht irgendwo auf. */
  function expectOnlyPreviews(views: PostView[], lockedIds: string[], lockedMedia: PostMedia[]) {
    const rowsById = new Map(lockedMedia.map((m) => [m.id, m]));
    const lockedViews = views.filter((v) => lockedIds.includes(v.id));
    expect(lockedViews).toHaveLength(lockedIds.length);
    for (const view of lockedViews) {
      expect(view.locked).toBe(true);
      expect(view.media).toHaveLength(view.mediaCount);
      for (const media of view.media) {
        const row = rowsById.get(media.id);
        expect(row).toBeDefined();
        expect(media.isPreview).toBe(true);
        expect(signedKey(media.url)).toBe(row!.previewKey);
      }
    }
    const everything = JSON.stringify(views);
    for (const row of lockedMedia) expect(everything).not.toContain(row.originalKey);
  }

  it("Fremder (angemeldet und anonym) sieht auf dem Profil nur Vorschauen", async () => {
    const s = await lockedScenario();
    const stranger = await viewerFor(t.db, (await createUser(t.db)).id, NOW);

    for (const viewer of [stranger, null]) {
      const page = await getCreatorPage(viewer, "lena_zh", { now: NOW });
      expect(page).not.toBeNull();
      expect(page!.viewerRelation.isSubscribed).toBe(false);
      expectOnlyPreviews(page!.posts, s.lockedIds, s.lockedMedia);

      const listed = await listCreatorPosts(viewer, s.creator.id, { now: NOW });
      expectOnlyPreviews(listed, s.lockedIds, s.lockedMedia);

      // Gegenprobe: der öffentliche Post ist nicht gesperrt.
      const openView = page!.posts.find((p) => p.id === s.openId);
      expect(openView?.locked).toBe(false);
      expect(signedKey(openView!.media[0].url)).toBe(s.openMedia[0].originalKey);
    }
  });

  it("abgelaufene oder beendete Abos schalten auf dem Profil nichts frei", async () => {
    const s = await lockedScenario();
    const ended = [
      { status: "active" as const, currentPeriodEnd: new Date(NOW.getTime() - MINUTE) },
      // Grenze: Periode endet genau jetzt → kein Zugriff mehr (wie isSubscriptionActive: end > now)
      { status: "active" as const, currentPeriodEnd: NOW },
      { status: "canceled" as const, currentPeriodEnd: new Date(NOW.getTime() - DAY) },
      { status: "expired" as const, currentPeriodEnd: new Date(NOW.getTime() + DAY) },
      { status: "pending" as const, currentPeriodStart: null, currentPeriodEnd: null },
    ];

    for (const overrides of ended) {
      const fan = await createUser(t.db);
      await createActiveSubscription(t.db, fan.id, s.creator.id, overrides);
      const viewer = await viewerFor(t.db, fan.id, NOW);

      const page = await getCreatorPage(viewer, "lena_zh", { now: NOW });
      expect(page!.viewerRelation.isSubscribed).toBe(false);
      expect(page!.viewerRelation.subscription).toBeNull();
      expectOnlyPreviews(page!.posts, s.lockedIds, s.lockedMedia);
      expectOnlyPreviews(await listCreatorPosts(viewer, s.creator.id, { now: NOW }), s.lockedIds, s.lockedMedia);
    }
  });

  it("Feed eines Fans mit abgelaufenem Abo enthält keine Originale dieses Creators", async () => {
    const s = await lockedScenario();
    const { user: other } = await createCreator(t.db);
    const otherPost = await insertPost(t.db, other.id, { visibility: "subscribers" });
    const fan = await createUser(t.db);
    await createActiveSubscription(t.db, fan.id, s.creator.id, {
      currentPeriodEnd: new Date(NOW.getTime() - MINUTE),
    });
    await createActiveSubscription(t.db, fan.id, other.id);
    const viewer = await viewerFor(t.db, fan.id, NOW);

    const feed = await getFeed(viewer, {}, { now: NOW });

    expect(feed.map((p) => p.id)).toEqual([otherPost.id]);
    const everything = JSON.stringify(feed);
    for (const row of [...s.lockedMedia, ...s.openMedia]) {
      expect(everything).not.toContain(row.originalKey);
      expect(everything).not.toContain(row.previewKey);
    }
    // Gegenprobe: das laufende Abo schaltet frei.
    const [otherMedia] = await mediaRowsOf(t.db, [otherPost.id]);
    expect(signedKey(feed[0].media[0].url)).toBe(otherMedia.originalKey);
  });

  it("Explore liefert überhaupt keine Post-Medien", async () => {
    const s = await lockedScenario();
    const stranger = await viewerFor(t.db, (await createUser(t.db)).id, NOW);

    for (const viewer of [stranger, null]) {
      const cards = await listCreatorsForExplore(viewer, {}, { now: NOW });
      expect(cards.map((c) => c.userId)).toEqual([s.creator.id]);
      const everything = JSON.stringify(cards);
      expect(everything).not.toContain("posts/");
      expect(everything).not.toContain("memory://");
      expect(Object.keys(cards[0]).sort()).toEqual(
        [
          "avatarUrl",
          "bio",
          "displayName",
          "handle",
          "isPremium",
          "monthlyPriceRappen",
          "postCount",
          "subscriberCount",
          "userId",
        ].sort(),
      );
    }
  });
});

// ─── media-urls ───────────────────────────────────────────────────────────────

describe("mediaViewsFor", () => {
  it("signiert gesperrt nur die Vorschau, sonst das Original – sortiert nach Position", async () => {
    const { user: creator } = await createCreator(t.db);
    const post = await insertPost(t.db, creator.id, { mediaCount: 3 });
    const rows = (await mediaRowsOf(t.db, [post.id])).reverse();

    const locked = await mediaViewsFor(rows, true);
    expect(locked.map((m) => signedKey(m.url))).toEqual([...rows].reverse().map((r) => r.previewKey));
    expect(locked.every((m) => m.isPreview)).toBe(true);

    const open = await mediaViewsFor(rows, false);
    expect(open.map((m) => signedKey(m.url))).toEqual([...rows].reverse().map((r) => r.originalKey));
    expect(open[0]).toMatchObject({ width: 1200, height: 1600, isPreview: false });
  });

  it("liefert für eine leere Liste nichts", async () => {
    expect(await mediaViewsFor([], true)).toEqual([]);
  });
});

// ─── Sichtbarkeit auf dem Profil ─────────────────────────────────────────────

describe("listCreatorPosts", () => {
  it("Abonnent (auch gekündigt bis Periodenende) bekommt die Originale", async () => {
    const { user: creator } = await createCreator(t.db, { user: { displayName: "Lena" } });
    await makePremium(t.db, creator.id, { now: NOW });
    const post = await insertPost(t.db, creator.id, { visibility: "subscribers", mediaCount: 2 });
    const rows = await mediaRowsOf(t.db, [post.id]);

    const active = await createUser(t.db);
    await createActiveSubscription(t.db, active.id, creator.id);
    const canceled = await createUser(t.db);
    await createActiveSubscription(t.db, canceled.id, creator.id, { status: "canceled", cancelAtPeriodEnd: true });

    for (const fan of [active, canceled]) {
      const [view] = await listCreatorPosts(await viewerFor(t.db, fan.id, NOW), creator.id, { now: NOW });
      expect(view.locked).toBe(false);
      expect(view.mediaCount).toBe(2);
      expect(view.media.map((m) => signedKey(m.url))).toEqual(rows.map((r) => r.originalKey));
      expect(view.media.every((m) => !m.isPreview)).toBe(true);
      expect(view.creator).toEqual({
        userId: creator.id,
        handle: creator.handle,
        displayName: "Lena",
        avatarUrl: null,
        isPremium: true,
      });
    }
  });

  it("Eigentümer und Admin sehen gesperrte Posts im Original", async () => {
    const { user: creator } = await createCreator(t.db);
    const post = await insertPost(t.db, creator.id, { visibility: "subscribers" });
    const [row] = await mediaRowsOf(t.db, [post.id]);
    const admin = await createAdmin(t.db);

    for (const id of [creator.id, admin.id]) {
      const [view] = await listCreatorPosts(await viewerFor(t.db, id, NOW), creator.id, { now: NOW });
      expect(view.locked).toBe(false);
      expect(signedKey(view.media[0].url)).toBe(row.originalKey);
    }
  });

  it("pending-Post erscheint nur für Eigentümer und Admin", async () => {
    const { user: creator } = await createCreator(t.db);
    const approved = await insertPost(t.db, creator.id, { visibility: "public" });
    const pending = await insertPost(t.db, creator.id, { moderationStatus: "pending", publishedAt: null });
    const rejected = await insertPost(t.db, creator.id, { moderationStatus: "rejected", publishedAt: null });
    const admin = await createAdmin(t.db);
    const fan = await createUser(t.db);
    await createActiveSubscription(t.db, fan.id, creator.id);

    for (const viewer of [null, await viewerFor(t.db, fan.id, NOW)]) {
      const ids = (await listCreatorPosts(viewer, creator.id, { now: NOW })).map((p) => p.id);
      expect(ids).toEqual([approved.id]);
    }
    for (const id of [creator.id, admin.id]) {
      const views = await listCreatorPosts(await viewerFor(t.db, id, NOW), creator.id, { now: NOW });
      expect(views.map((p) => p.id).sort()).toEqual([approved.id, pending.id, rejected.id].sort());
      expect(views.find((p) => p.id === pending.id)).toMatchObject({ moderationStatus: "pending", locked: false });
    }
  });

  it("gelöschte Posts erscheinen für niemanden", async () => {
    const { user: creator } = await createCreator(t.db);
    await insertPost(t.db, creator.id, { visibility: "public", deletedAt: new Date(NOW.getTime() - MINUTE) });
    const admin = await createAdmin(t.db);

    for (const viewer of [null, await viewerFor(t.db, creator.id, NOW), await viewerFor(t.db, admin.id, NOW)]) {
      expect(await listCreatorPosts(viewer, creator.id, { now: NOW })).toEqual([]);
    }
  });

  it("gesperrter Creator: Posts verschwinden für alle ausser Admin (auch für Abonnenten und ihn selbst)", async () => {
    const { user: creator } = await createCreator(t.db, { user: { status: "banned", bannedAt: NOW } });
    await insertPost(t.db, creator.id, { visibility: "public" });
    const fan = await createUser(t.db);
    await createActiveSubscription(t.db, fan.id, creator.id);
    const admin = await createAdmin(t.db);

    for (const viewer of [null, await viewerFor(t.db, fan.id, NOW), await viewerFor(t.db, creator.id, NOW)]) {
      expect(await listCreatorPosts(viewer, creator.id, { now: NOW })).toEqual([]);
    }
    expect(await listCreatorPosts(await viewerFor(t.db, admin.id, NOW), creator.id, { now: NOW })).toHaveLength(1);
  });

  it("gesperrter Fan bekommt trotz Abo nur Vorschauen", async () => {
    const { user: creator } = await createCreator(t.db);
    await insertPost(t.db, creator.id, { visibility: "subscribers" });
    const fan = await createUser(t.db, { status: "banned", bannedAt: NOW });
    await createActiveSubscription(t.db, fan.id, creator.id);

    const [view] = await listCreatorPosts(await viewerFor(t.db, fan.id, NOW), creator.id, { now: NOW });
    expect(view.locked).toBe(true);
    expect(view.media.every((m) => m.isPreview)).toBe(true);
  });

  it("Creator ohne Freigabe: Posts nur für Eigentümer und Admin", async () => {
    const { user: creator } = await createCreator(t.db, { profile: { verificationStatus: "rejected" } });
    await insertPost(t.db, creator.id, { visibility: "public" });

    expect(await listCreatorPosts(null, creator.id, { now: NOW })).toEqual([]);
    expect(await listCreatorPosts(await viewerFor(t.db, creator.id, NOW), creator.id, { now: NOW })).toHaveLength(1);
  });

  it("Moderationsnotiz sehen nur Eigentümer und Admin; neueste Posts zuerst", async () => {
    const { user: creator } = await createCreator(t.db);
    const older = await insertPost(t.db, creator.id, {
      visibility: "public",
      moderationNote: "Bitte keine Wasserzeichen",
      publishedAt: new Date(NOW.getTime() - 2 * DAY),
    });
    const newer = await insertPost(t.db, creator.id, { visibility: "public", publishedAt: NOW });

    const forStranger = await listCreatorPosts(null, creator.id, { now: NOW });
    expect(forStranger.map((p) => p.id)).toEqual([newer.id, older.id]);
    expect(forStranger[1].moderationNote).toBeNull();

    const forOwner = await listCreatorPosts(await viewerFor(t.db, creator.id, NOW), creator.id, { now: NOW });
    expect(forOwner[1].moderationNote).toBe("Bitte keine Wasserzeichen");
  });

  it("unbekannte oder ungültige Creator-ID → leere Liste", async () => {
    expect(await listCreatorPosts(null, "00000000-0000-0000-0000-000000000000", { now: NOW })).toEqual([]);
    expect(await listCreatorPosts(null, "keine-uuid", { now: NOW })).toEqual([]);
  });
});

// ─── Feed ─────────────────────────────────────────────────────────────────────

describe("getFeed", () => {
  it("zeigt nur sichtbare Posts abonnierter Creator, neueste zuerst", async () => {
    const { user: a } = await createCreator(t.db);
    const { user: b } = await createCreator(t.db);
    const { user: notSubscribed } = await createCreator(t.db);
    const { user: banned } = await createCreator(t.db, { user: { status: "banned", bannedAt: NOW } });
    const fan = await createUser(t.db);
    await createActiveSubscription(t.db, fan.id, a.id);
    await createActiveSubscription(t.db, fan.id, b.id, { status: "canceled", cancelAtPeriodEnd: true });
    await createActiveSubscription(t.db, fan.id, banned.id);

    const a1 = await insertPost(t.db, a.id, { publishedAt: new Date(NOW.getTime() - 3 * DAY) });
    const b1 = await insertPost(t.db, b.id, { publishedAt: new Date(NOW.getTime() - DAY), visibility: "public" });
    const a2 = await insertPost(t.db, a.id, { publishedAt: new Date(NOW.getTime() - MINUTE) });
    await insertPost(t.db, a.id, { moderationStatus: "pending", publishedAt: null });
    await insertPost(t.db, a.id, { deletedAt: NOW });
    await insertPost(t.db, notSubscribed.id, { visibility: "public" });
    await insertPost(t.db, banned.id, { visibility: "public" });

    const feed = await getFeed(await viewerFor(t.db, fan.id, NOW), undefined, { now: NOW });

    expect(feed.map((p) => p.id)).toEqual([a2.id, b1.id, a1.id]);
    expect(feed.every((p) => !p.locked && p.media.every((m) => !m.isPreview))).toBe(true);
  });

  it("blättert mit limit und before", async () => {
    const { user: creator } = await createCreator(t.db);
    const fan = await createUser(t.db);
    await createActiveSubscription(t.db, fan.id, creator.id);
    const created = [];
    for (let i = 0; i < 5; i++) {
      created.push(await insertPost(t.db, creator.id, { publishedAt: new Date(NOW.getTime() - (i + 1) * DAY) }));
    }
    const viewer = await viewerFor(t.db, fan.id, NOW);

    const first = await getFeed(viewer, { limit: 2 }, { now: NOW });
    expect(first.map((p) => p.id)).toEqual([created[0].id, created[1].id]);

    const second = await getFeed(viewer, { limit: 2, before: first[1].publishedAt! }, { now: NOW });
    expect(second.map((p) => p.id)).toEqual([created[2].id, created[3].id]);
  });

  it("blättert bei gleichem Zeitstempel lückenlos und ohne Doppelte (before + beforeId)", async () => {
    const { user: creator } = await createCreator(t.db);
    const fan = await createUser(t.db);
    await createActiveSubscription(t.db, fan.id, creator.id);
    // z. B. mehrere Posts in einem Rutsch freigegeben: gleicher published_at
    const sameTime = new Date(NOW.getTime() - DAY);
    const tied = [];
    for (let i = 0; i < 3; i++) tied.push(await insertPost(t.db, creator.id, { publishedAt: sameTime }));
    const older = await insertPost(t.db, creator.id, { publishedAt: new Date(NOW.getTime() - 2 * DAY) });
    const viewer = await viewerFor(t.db, fan.id, NOW);

    const seen: string[] = [];
    let page = await getFeed(viewer, { limit: 2 }, { now: NOW });
    for (let guard = 0; page.length > 0 && guard < 10; guard++) {
      seen.push(...page.map((p) => p.id));
      const last = page[page.length - 1];
      const cursor = { before: last.publishedAt ?? last.createdAt, beforeId: last.id };
      page = await getFeed(viewer, { limit: 2, ...cursor }, { now: NOW });
    }

    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(4);
    expect(seen.slice(0, 3).sort()).toEqual(tied.map((p) => p.id).sort());
    expect(seen[3]).toBe(older.id);
  });

  it("ungültiger Cursor (Datum, beforeId ohne before, keine UUID) → ValidationError", async () => {
    const fan = await createUser(t.db);
    const viewer = await viewerFor(t.db, fan.id, NOW);
    const id = "00000000-0000-0000-0000-000000000000";
    for (const input of [
      { before: new Date("kein Datum") },
      { beforeId: id },
      { before: NOW, beforeId: "keine-uuid" },
    ]) {
      await expect(getFeed(viewer, input, { now: NOW })).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it("ohne Abos ist der Feed leer", async () => {
    const { user: creator } = await createCreator(t.db);
    await insertPost(t.db, creator.id, { visibility: "public" });
    const fan = await createUser(t.db);
    expect(await getFeed(await viewerFor(t.db, fan.id, NOW), {}, { now: NOW })).toEqual([]);
  });

  it("gesperrter Fan → ForbiddenError, ohne Anmeldung → AuthError", async () => {
    const fan = await createUser(t.db, { status: "banned", bannedAt: NOW });
    await expect(getFeed(await viewerFor(t.db, fan.id, NOW), {}, { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getFeed(null as never, {}, { now: NOW })).rejects.toBeInstanceOf(AuthError);
  });
});

// ─── Studio ───────────────────────────────────────────────────────────────────

describe("listMyPosts", () => {
  it("zeigt eigene Posts in jedem Moderationsstatus (ohne gelöschte) mit Notiz und Originalen", async () => {
    const { user: creator } = await createCreator(t.db);
    const { user: other } = await createCreator(t.db);
    const approved = await insertPost(t.db, creator.id, { createdAt: new Date(NOW.getTime() - 2 * DAY) });
    const rejected = await insertPost(t.db, creator.id, {
      moderationStatus: "rejected",
      moderationNote: "Bild unscharf",
      publishedAt: null,
      createdAt: new Date(NOW.getTime() - DAY),
    });
    const pending = await insertPost(t.db, creator.id, {
      moderationStatus: "pending",
      publishedAt: null,
      createdAt: NOW,
    });
    await insertPost(t.db, creator.id, { deletedAt: NOW });
    await insertPost(t.db, other.id);

    const mine = await listMyPosts(await viewerFor(t.db, creator.id, NOW), { now: NOW });

    expect(mine.map((p) => p.id)).toEqual([pending.id, rejected.id, approved.id]);
    expect(mine[1]).toMatchObject({ moderationStatus: "rejected", moderationNote: "Bild unscharf", locked: false });
    expect(mine.every((p) => p.media.every((m) => !m.isPreview))).toBe(true);
  });

  it("ohne Creator-Profil → ForbiddenError", async () => {
    const fan = await createUser(t.db);
    await expect(listMyPosts(await viewerFor(t.db, fan.id, NOW))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("deletePost", () => {
  it("Eigentümer löscht weich; der Post verschwindet überall", async () => {
    const { user: creator } = await createCreator(t.db);
    const post = await insertPost(t.db, creator.id, { visibility: "public" });
    const viewer = await viewerFor(t.db, creator.id, NOW);

    await deletePost(viewer, post.id, { now: NOW });

    const [row] = await t.db.select().from(posts).where(eq(posts.id, post.id));
    expect(row.deletedAt?.getTime()).toBe(NOW.getTime());
    expect(await mediaRowsOf(t.db, [post.id])).toHaveLength(1);
    expect(await listMyPosts(viewer, { now: NOW })).toEqual([]);
    expect(await listCreatorPosts(null, creator.id, { now: NOW })).toEqual([]);
  });

  it("fremder Post → ForbiddenError; unbekannt, ungültig oder schon gelöscht → NotFoundError", async () => {
    const { user: creator } = await createCreator(t.db);
    const { user: other } = await createCreator(t.db);
    const post = await insertPost(t.db, creator.id);
    const gone = await insertPost(t.db, creator.id, { deletedAt: NOW });
    const otherViewer = await viewerFor(t.db, other.id, NOW);
    const owner = await viewerFor(t.db, creator.id, NOW);

    await expect(deletePost(otherViewer, post.id, { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deletePost(owner, gone.id, { now: NOW })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deletePost(owner, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(NotFoundError);
    await expect(deletePost(owner, "nope")).rejects.toBeInstanceOf(NotFoundError);
    const [row] = await t.db.select().from(posts).where(eq(posts.id, post.id));
    expect(row.deletedAt).toBeNull();
  });

  it("gesperrter Eigentümer → ForbiddenError", async () => {
    const { user: creator } = await createCreator(t.db, { user: { status: "banned", bannedAt: NOW } });
    const post = await insertPost(t.db, creator.id);
    await expect(deletePost(await viewerFor(t.db, creator.id, NOW), post.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ─── createPost ───────────────────────────────────────────────────────────────

describe("createPost", () => {
  async function approvedCreator() {
    const { user } = await createCreator(t.db);
    return { user, viewer: await viewerFor(t.db, user.id, NOW) };
  }

  it("legt Post und Medien an und lädt Original und Vorschau hoch", async () => {
    const { user, viewer } = await approvedCreator();
    const files = await imageFiles(2);

    const input = { caption: "  Barfuss im Gras  ", visibility: "public" as const, files };
    const result = await createPost(viewer, input, { now: NOW });

    expect(result.moderationStatus).toBe("pending");
    const [row] = await postRows(user.id);
    expect(row).toMatchObject({
      id: result.postId,
      caption: "Barfuss im Gras",
      visibility: "public",
      moderationStatus: "pending",
      publishedAt: null,
      deletedAt: null,
    });
    expect(row.createdAt.getTime()).toBe(NOW.getTime());

    const media = await mediaRowsOf(t.db, [result.postId]);
    expect(media.map((m) => m.position)).toEqual([0, 1]);
    for (const m of media) {
      expect(m.originalKey.startsWith(`posts/${result.postId}/${m.position}-`)).toBe(true);
      expect(m.previewKey.startsWith(`posts/${result.postId}/${m.position}-`)).toBe(true);
      expect(m).toMatchObject({ width: 64, height: 48, mimeType: "image/webp" });
      expect(m.bytes).toBe(storage.objects.get(m.originalKey)?.data.length);
      expect(storage.objects.get(m.originalKey)?.contentType).toBe("image/webp");
      expect(storage.objects.get(m.previewKey)?.contentType).toBe("image/webp");
    }
    expect(storage.objects.size).toBe(4);
  });

  it("Vorab-Prüfung: Posts 1–5 sind pending, nach 5 Freigaben direkt approved", async () => {
    const { user, viewer } = await approvedCreator();
    const files = await imageFiles(1);

    for (let i = 0; i < 5; i++) {
      const r = await createPost(viewer, { caption: `Post ${i + 1}`, visibility: "subscribers", files }, { now: NOW });
      expect(r.moderationStatus).toBe("pending");
    }
    await t.db
      .update(posts)
      .set({ moderationStatus: "approved", publishedAt: NOW })
      .where(eq(posts.creatorId, user.id));

    const sixth = await createPost(viewer, { caption: "Post 6", visibility: "subscribers", files }, { now: NOW });

    expect(sixth.moderationStatus).toBe("approved");
    const [row] = await t.db.select().from(posts).where(eq(posts.id, sixth.postId));
    expect(row.moderationStatus).toBe("approved");
    expect(row.publishedAt?.getTime()).toBe(NOW.getTime());
  });

  it("zählt für die Vorab-Prüfung nur freigegebene, nicht gelöschte Posts", async () => {
    const { user, viewer } = await approvedCreator();
    for (let i = 0; i < 4; i++) await insertPost(t.db, user.id);
    await insertPost(t.db, user.id, { deletedAt: NOW });
    await insertPost(t.db, user.id, { moderationStatus: "removed" });
    await insertPost(t.db, user.id, { moderationStatus: "pending", publishedAt: null });

    const r = await createPost(viewer, { caption: "", visibility: "public", files: await imageFiles(1) }, { now: NOW });
    expect(r.moderationStatus).toBe("pending");
  });

  it("richtet sich nach der eingestellten Vorab-Prüfzahl", async () => {
    const { viewer } = await approvedCreator();
    await t.db.update(platformSettings).set({ premoderationCount: 0 });

    const r = await createPost(viewer, { caption: "", visibility: "public", files: await imageFiles(1) }, { now: NOW });
    expect(r.moderationStatus).toBe("approved");
  });

  it("nicht freigegebener, gesperrter oder Nicht-Creator → ForbiddenError ohne Upload", async () => {
    const { user: pending } = await createCreator(t.db, { profile: { verificationStatus: "pending" } });
    const { user: rejected } = await createCreator(t.db, { profile: { verificationStatus: "rejected" } });
    const { user: banned } = await createCreator(t.db, { user: { status: "banned", bannedAt: NOW } });
    const fan = await createUser(t.db);
    const files = await imageFiles(1);

    for (const id of [pending.id, rejected.id, banned.id, fan.id]) {
      const viewer = await viewerFor(t.db, id, NOW);
      const attempt = createPost(viewer, { caption: "", visibility: "public", files }, { now: NOW });
      await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(storage.objects.size).toBe(0);
    expect(await t.db.select().from(posts)).toHaveLength(0);
  });

  it("0 oder 11 Bilder → ValidationError", async () => {
    const { viewer } = await approvedCreator();
    for (const files of [[], await imageFiles(11)]) {
      const input = { caption: "", visibility: "public" as const, files };
      const error = await createPost(viewer, input, { now: NOW }).catch((e) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors.files).toBeDefined();
    }
    expect(storage.objects.size).toBe(0);
    expect(await t.db.select().from(posts)).toHaveLength(0);
  });

  it("zu lange Caption, falscher Dateityp oder ungültige Sichtbarkeit → ValidationError", async () => {
    const { viewer } = await approvedCreator();
    const [file] = await imageFiles(1);

    const cases = [
      { caption: "x".repeat(2001), visibility: "public", files: [file] },
      { caption: "", visibility: "public", files: [{ ...file, name: "fuss.gif", type: "image/gif" }] },
      { caption: "", visibility: "friends", files: [file] },
    ];
    for (const input of cases) {
      await expect(createPost(viewer, input as never, { now: NOW })).rejects.toBeInstanceOf(ValidationError);
    }
    expect(storage.objects.size).toBe(0);
  });

  it("räumt hochgeladene Objekte auf, wenn ein späteres Bild kaputt ist", async () => {
    const { user, viewer } = await approvedCreator();
    const [good] = await imageFiles(1);
    const broken = { bytes: Buffer.from("kein Bild"), name: "kaputt.png", type: "image/png" };

    await expect(
      createPost(viewer, { caption: "", visibility: "public", files: [good, good, broken] }, { now: NOW }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(storage.objects.size).toBe(0);
    expect(await postRows(user.id)).toHaveLength(0);
    expect(await t.db.select().from(postMedia)).toHaveLength(0);
  });

  it("räumt hochgeladene Objekte auf, wenn der Speicher mitten im Upload ausfällt", async () => {
    const { user, viewer } = await approvedCreator();
    const failing = new FailingMediaStorage(4);
    setMediaStorageForTesting(failing);

    await expect(
      createPost(viewer, { caption: "", visibility: "public", files: await imageFiles(3) }, { now: NOW }),
    ).rejects.toThrow("Speicher nicht erreichbar");

    expect(failing.puts).toBe(4);
    expect(failing.objects.size).toBe(0);
    expect(await postRows(user.id)).toHaveLength(0);
  });

  it("scheitert die DB-Transaktion, bleibt weder Post noch Medium noch Objekt zurück", async () => {
    const { user, viewer } = await approvedCreator();
    await t.db.execute(sql`ALTER TABLE post_media ADD CONSTRAINT task7_test_fail CHECK (bytes < 0)`);
    try {
      await expect(
        createPost(viewer, { caption: "", visibility: "public", files: await imageFiles(2) }, { now: NOW }),
      ).rejects.toThrow();
    } finally {
      await t.db.execute(sql`ALTER TABLE post_media DROP CONSTRAINT task7_test_fail`);
    }

    expect(await postRows(user.id)).toHaveLength(0);
    expect(await t.db.select().from(postMedia)).toHaveLength(0);
    expect(storage.objects.size).toBe(0);
  });

  it("akzeptiert JPEG und WebP", async () => {
    const { viewer } = await approvedCreator();
    const files = [
      { bytes: await testImage({ format: "jpeg" }), name: "a.jpg", type: "image/jpeg" },
      { bytes: await testImage({ format: "webp" }), name: "b.webp", type: "image/webp" },
    ];
    const r = await createPost(viewer, { caption: "", visibility: "subscribers", files }, { now: NOW });
    expect(await mediaRowsOf(t.db, [r.postId])).toHaveLength(2);
  });
});

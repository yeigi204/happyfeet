import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auditLog, creatorProfiles, platformSettings } from "@/server/db/schema";
import { AuthError, ConflictError, ForbiddenError, ValidationError } from "@/server/errors";
import {
  applyAsCreator,
  getCreatorPage,
  getMyCreatorProfile,
  listCreatorsForExplore,
  updateCreatorProfile,
} from "@/server/services/creators";
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

const NOW = new Date();
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

beforeAll(() => {
  setMediaStorageForTesting(new InMemoryMediaStorage());
});

afterAll(() => {
  setMediaStorageForTesting(null);
});

async function profileOf(userId: string) {
  const [row] = await t.db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId));
  return row;
}

// ─── Bewerbung & Profil ───────────────────────────────────────────────────────

describe("applyAsCreator", () => {
  it("legt ein Profil im Status pending an und protokolliert die Bewerbung", async () => {
    const user = await createUser(t.db);
    const viewer = await viewerFor(t.db, user.id, NOW);

    const input = { bio: "  Pedikürte Füsse aus Bern  ", monthlyPriceRappen: 990 };
    const profile = await applyAsCreator(viewer, input, { now: NOW });

    expect(profile).toMatchObject({
      userId: user.id,
      bio: "Pedikürte Füsse aus Bern",
      monthlyPriceRappen: 990,
      verificationStatus: "pending",
      verifiedAt: null,
      appliedAt: NOW,
    });
    expect(await profileOf(user.id)).toMatchObject({ verificationStatus: "pending", monthlyPriceRappen: 990 });
    const audit = await t.db.select().from(auditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: user.id,
      action: "creator.applied",
      targetType: "creator",
      targetId: user.id,
    });
  });

  it("zweite Bewerbung (pending oder approved) → ConflictError", async () => {
    const { user: pending } = await createCreator(t.db, { profile: { verificationStatus: "pending" } });
    const { user: approved } = await createCreator(t.db);

    for (const id of [pending.id, approved.id]) {
      await expect(
        applyAsCreator(await viewerFor(t.db, id, NOW), { bio: "", monthlyPriceRappen: 990 }, { now: NOW }),
      ).rejects.toBeInstanceOf(ConflictError);
    }
    expect((await profileOf(approved.id)).verificationStatus).toBe("approved");
  });

  it("nach einer Ablehnung ist eine neue Bewerbung möglich", async () => {
    const { user } = await createCreator(t.db, {
      profile: {
        verificationStatus: "rejected",
        verificationNote: "Ausweis unleserlich",
        verifiedAt: NOW,
        appliedAt: new Date(NOW.getTime() - 30 * 86_400_000),
      },
    });

    const profile = await applyAsCreator(
      await viewerFor(t.db, user.id, NOW),
      { bio: "Neuer Versuch", monthlyPriceRappen: 1490 },
      { now: NOW },
    );

    expect(profile).toMatchObject({
      verificationStatus: "pending",
      verificationNote: null,
      verifiedAt: null,
      bio: "Neuer Versuch",
      monthlyPriceRappen: 1490,
      // neue Bewerbung → stellt sich mit dem aktuellen Zeitpunkt hinten an
      appliedAt: NOW,
    });
  });

  it("Preis ausserhalb des Rahmens oder nicht in 10-Rappen-Schritten → ValidationError", async () => {
    const viewer = await viewerFor(t.db, (await createUser(t.db)).id, NOW);
    for (const monthlyPriceRappen of [480, 4999, 995, 5000, -10, 9.5]) {
      const error = await applyAsCreator(viewer, { bio: "", monthlyPriceRappen }, { now: NOW }).catch((e) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors.monthlyPriceRappen).toBeDefined();
    }
    expect(await t.db.select().from(creatorProfiles)).toHaveLength(0);
  });

  it("richtet sich nach dem eingestellten Preisrahmen", async () => {
    await t.db.update(platformSettings).set({ minPriceRappen: 1000, maxPriceRappen: 2000 });
    const viewer = await viewerFor(t.db, (await createUser(t.db)).id, NOW);
    await expect(applyAsCreator(viewer, { bio: "", monthlyPriceRappen: 990 })).rejects.toBeInstanceOf(ValidationError);
    await expect(applyAsCreator(viewer, { bio: "", monthlyPriceRappen: 1500 })).resolves.toBeDefined();
  });

  it("zu lange Bio → ValidationError", async () => {
    const viewer = await viewerFor(t.db, (await createUser(t.db)).id, NOW);
    await expect(applyAsCreator(viewer, { bio: "x".repeat(1001), monthlyPriceRappen: 990 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("ohne Onboarding oder gesperrt → ForbiddenError", async () => {
    const fresh = await createUser(t.db, { handle: null, displayName: null, onboardedAt: null });
    const banned = await createUser(t.db, { status: "banned", bannedAt: NOW });
    for (const id of [fresh.id, banned.id]) {
      await expect(
        applyAsCreator(await viewerFor(t.db, id, NOW), { bio: "", monthlyPriceRappen: 990 }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await t.db.select().from(creatorProfiles)).toHaveLength(0);
  });
});

describe("updateCreatorProfile", () => {
  it("ändert Bio und Preis (auch einzeln)", async () => {
    const { user } = await createCreator(t.db);
    const viewer = await viewerFor(t.db, user.id, NOW);

    const updated = await updateCreatorProfile(viewer, { bio: " Neue Bio ", monthlyPriceRappen: 1290 }, { now: NOW });
    expect(updated).toMatchObject({ bio: "Neue Bio", monthlyPriceRappen: 1290 });

    const priceOnly = await updateCreatorProfile(viewer, { monthlyPriceRappen: 1990 }, { now: NOW });
    expect(priceOnly).toMatchObject({ bio: "Neue Bio", monthlyPriceRappen: 1990 });
    expect(await profileOf(user.id)).toMatchObject({ bio: "Neue Bio", monthlyPriceRappen: 1990 });
  });

  it("ungültiger Preis → ValidationError, Profil unverändert", async () => {
    const { user, profile } = await createCreator(t.db);
    const viewer = await viewerFor(t.db, user.id, NOW);
    await expect(updateCreatorProfile(viewer, { monthlyPriceRappen: 10 })).rejects.toBeInstanceOf(ValidationError);
    expect((await profileOf(user.id)).monthlyPriceRappen).toBe(profile.monthlyPriceRappen);
  });

  it("ohne Creator-Profil oder gesperrt → ForbiddenError", async () => {
    const fan = await createUser(t.db);
    const { user: banned } = await createCreator(t.db, { user: { status: "banned", bannedAt: NOW } });
    for (const id of [fan.id, banned.id]) {
      await expect(updateCreatorProfile(await viewerFor(t.db, id, NOW), { bio: "x" })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
  });
});

describe("getMyCreatorProfile", () => {
  it("liefert das eigene Profil oder null", async () => {
    const { user, profile } = await createCreator(t.db, { profile: { verificationStatus: "pending" } });
    const fan = await createUser(t.db);

    expect(await getMyCreatorProfile(await viewerFor(t.db, user.id, NOW))).toEqual(profile);
    expect(await getMyCreatorProfile(await viewerFor(t.db, fan.id, NOW))).toBeNull();
    await expect(getMyCreatorProfile(null as never)).rejects.toBeInstanceOf(AuthError);
  });
});

// ─── Explore ──────────────────────────────────────────────────────────────────

describe("listCreatorsForExplore", () => {
  it("zeigt nur freigegebene, aktive Creator", async () => {
    const { user: approved } = await createCreator(t.db);
    await createCreator(t.db, { profile: { verificationStatus: "pending" } });
    await createCreator(t.db, { profile: { verificationStatus: "rejected" } });
    await createCreator(t.db, { user: { status: "banned", bannedAt: NOW } });
    await createUser(t.db);

    const cards = await listCreatorsForExplore(null, undefined, { now: NOW });
    expect(cards.map((c) => c.userId)).toEqual([approved.id]);
  });

  it("Reihenfolge: Premium zuerst, dann Abonnenten absteigend, dann neueste", async () => {
    const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY);
    const { user: popular } = await createCreator(t.db, { profile: { createdAt: at(30) } });
    const { user: premium } = await createCreator(t.db, { profile: { createdAt: at(40) } });
    const { user: older } = await createCreator(t.db, { profile: { createdAt: at(20) } });
    const { user: newer } = await createCreator(t.db, { profile: { createdAt: at(10) } });
    const { user: expiredPremium } = await createCreator(t.db, { profile: { createdAt: at(5) } });
    await makePremium(t.db, premium.id, { now: NOW });
    await makePremium(t.db, expiredPremium.id, { now: new Date(NOW.getTime() - 60 * DAY) });

    for (let i = 0; i < 3; i++) await createActiveSubscription(t.db, (await createUser(t.db)).id, popular.id);
    await createActiveSubscription(t.db, (await createUser(t.db)).id, older.id);
    await createActiveSubscription(t.db, (await createUser(t.db)).id, newer.id);

    const cards = await listCreatorsForExplore(null, {}, { now: NOW });

    expect(cards.map((c) => c.userId)).toEqual([premium.id, popular.id, newer.id, older.id, expiredPremium.id]);
    expect(cards.map((c) => c.isPremium)).toEqual([true, false, false, false, false]);
  });

  it("zählt nur Abonnenten mit laufendem Zugriff und nur sichtbare Posts", async () => {
    const { user: creator, profile } = await createCreator(t.db, {
      user: { displayName: "Lena", avatarKey: "avatars/lena.webp" },
      profile: { bio: "Sandalen-Saison", monthlyPriceRappen: 1290 },
    });
    const sub = async (overrides: Parameters<typeof createActiveSubscription>[3]) =>
      createActiveSubscription(t.db, (await createUser(t.db)).id, creator.id, overrides);
    await sub({});
    await sub({ status: "canceled", cancelAtPeriodEnd: true });
    await sub({ currentPeriodEnd: new Date(NOW.getTime() - MINUTE) });
    await sub({ status: "expired" });
    await sub({ status: "pending", currentPeriodStart: null, currentPeriodEnd: null });

    await createPost(t.db, creator.id);
    await createPost(t.db, creator.id, { visibility: "public" });
    await createPost(t.db, creator.id, { moderationStatus: "pending", publishedAt: null });
    await createPost(t.db, creator.id, { moderationStatus: "removed" });
    await createPost(t.db, creator.id, { deletedAt: NOW });

    const [card] = await listCreatorsForExplore(null, {}, { now: NOW });

    expect(card).toEqual({
      userId: creator.id,
      handle: creator.handle,
      displayName: "Lena",
      avatarUrl: expect.stringMatching(/^memory:\/\/avatars\/lena\.webp\?exp=\d+$/),
      bio: "Sandalen-Saison",
      monthlyPriceRappen: profile.monthlyPriceRappen,
      isPremium: false,
      subscriberCount: 2,
      postCount: 2,
    });
  });

  it("filtert nach Handle oder Name (ohne Gross-/Kleinschreibung, @ wird ignoriert)", async () => {
    const { user: anna } = await createCreator(t.db, { user: { handle: "anna_zh", displayName: "Anna Muster" } });
    const { user: bea } = await createCreator(t.db, { user: { handle: "bea_be", displayName: "Beatrice Zürcher" } });
    await createCreator(t.db, { user: { handle: "carla", displayName: "Carla" } });

    const ids = async (query: string) =>
      (await listCreatorsForExplore(null, { query }, { now: NOW })).map((c) => c.userId).sort();

    expect(await ids("@ANNA")).toEqual([anna.id]);
    expect(await ids("zürch")).toEqual([bea.id]);
    expect(await ids("_")).toEqual([anna.id, bea.id].sort());
    expect(await ids("%")).toEqual([]);
    expect(await ids("   ")).toHaveLength(3);
  });

  it("begrenzt die Anzahl", async () => {
    for (let i = 0; i < 4; i++) await createCreator(t.db);
    expect(await listCreatorsForExplore(null, { limit: 2 }, { now: NOW })).toHaveLength(2);
  });
});

// ─── Creator-Seite ────────────────────────────────────────────────────────────

describe("getCreatorPage", () => {
  it("findet den Creator unabhängig von Gross-/Kleinschreibung und @", async () => {
    const { user } = await createCreator(t.db, {
      user: { handle: "anna_zh" },
      profile: { bannerKey: "banners/anna.webp" },
    });

    const page = await getCreatorPage(null, "  @Anna_ZH ", { now: NOW });

    expect(page?.creator.userId).toBe(user.id);
    expect(page?.creator.avatarUrl).toBeNull();
    expect(page?.creator.bannerUrl).toMatch(/^memory:\/\/banners\/anna\.webp\?exp=\d+$/);
    expect(page?.viewerRelation).toEqual({ isOwner: false, isSubscribed: false, subscription: null });
  });

  it("unbekannter Handle oder Nutzer ohne Creator-Profil → null", async () => {
    await createUser(t.db, { handle: "nur_fan" });
    expect(await getCreatorPage(null, "gibt_es_nicht", { now: NOW })).toBeNull();
    expect(await getCreatorPage(null, "nur_fan", { now: NOW })).toBeNull();
  });

  it("nicht freigegebener Creator: null für Fremde, sichtbar für Eigentümer und Admin", async () => {
    const { user } = await createCreator(t.db, {
      user: { handle: "neu_hier" },
      profile: { verificationStatus: "pending" },
    });
    const fan = await createUser(t.db);
    const admin = await createAdmin(t.db);

    expect(await getCreatorPage(null, "neu_hier", { now: NOW })).toBeNull();
    expect(await getCreatorPage(await viewerFor(t.db, fan.id, NOW), "neu_hier", { now: NOW })).toBeNull();

    const own = await getCreatorPage(await viewerFor(t.db, user.id, NOW), "neu_hier", { now: NOW });
    expect(own?.viewerRelation.isOwner).toBe(true);
    expect(await getCreatorPage(await viewerFor(t.db, admin.id, NOW), "neu_hier", { now: NOW })).not.toBeNull();
  });

  it("gesperrter Creator → null für Fremde, Abonnenten und ihn selbst, sichtbar nur für Admin", async () => {
    const { user } = await createCreator(t.db, { user: { handle: "gesperrt", status: "banned", bannedAt: NOW } });
    await createPost(t.db, user.id, { visibility: "public" });
    const fan = await createUser(t.db);
    await createActiveSubscription(t.db, fan.id, user.id);
    const admin = await createAdmin(t.db);

    for (const viewer of [null, await viewerFor(t.db, fan.id, NOW), await viewerFor(t.db, user.id, NOW)]) {
      expect(await getCreatorPage(viewer, "gesperrt", { now: NOW })).toBeNull();
    }
    const forAdmin = await getCreatorPage(await viewerFor(t.db, admin.id, NOW), "gesperrt", { now: NOW });
    expect(forAdmin?.posts).toHaveLength(1);
  });

  it("zeigt Abonnenten ihr laufendes Abo (auch gekündigt bis Periodenende)", async () => {
    const { user: creator } = await createCreator(t.db, { user: { handle: "lena_zh" } });
    await createPost(t.db, creator.id, { visibility: "subscribers" });
    const fan = await createUser(t.db);
    const sub = await createActiveSubscription(t.db, fan.id, creator.id, {
      status: "canceled",
      cancelAtPeriodEnd: true,
    });

    const page = await getCreatorPage(await viewerFor(t.db, fan.id, NOW), "lena_zh", { now: NOW });

    expect(page?.viewerRelation).toEqual({
      isOwner: false,
      isSubscribed: true,
      subscription: { id: sub.id, currentPeriodEnd: sub.currentPeriodEnd, cancelAtPeriodEnd: true },
    });
    expect(page?.posts[0].locked).toBe(false);
    expect(page?.creator.subscriberCount).toBe(1);
  });
});

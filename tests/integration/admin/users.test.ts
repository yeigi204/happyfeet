import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { auditLog, premiumSubscriptions, subscriptions, users } from "@/server/db/schema";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { banUser, quickSearch, searchUsers, unbanUser } from "@/server/services/admin/users";

import { setupTestDb } from "../../helpers/db";
import {
  createActiveSubscription,
  createAdmin,
  createCreator,
  createUser,
  makePremium,
  viewerFor,
} from "../../helpers/factories";
import { daysAfter, daysBefore } from "../../helpers/task9";

const t = setupTestDb();
const NOW = new Date("2026-11-04T10:00:00Z");

async function fixture() {
  const adminUser = await createAdmin(t.db, {
    handle: "chefin",
    displayName: "Mara Keller",
    email: "mara@happyfeet.test",
    createdAt: daysBefore(NOW, 100),
  });
  const admin = await viewerFor(t.db, adminUser.id, NOW);
  const { user: nina } = await createCreator(t.db, {
    user: { handle: "zehenspiel", displayName: "Nina Zehnder", email: "nina@example.ch", createdAt: daysBefore(NOW, 50) },
  });
  await makePremium(t.db, nina.id, { now: NOW });
  const { user: lena } = await createCreator(t.db, {
    user: { handle: "lena_barfuss", displayName: "Lena Baumann", email: "lena@example.ch", createdAt: daysBefore(NOW, 40) },
    profile: { verificationStatus: "pending" },
  });
  const luca = await createUser(t.db, {
    handle: "luca_m",
    displayName: "Luca Müller",
    email: "luca.mueller@example.ch",
    createdAt: daysBefore(NOW, 30),
  });
  const percent = await createUser(t.db, {
    handle: "hundert",
    displayName: "100% Fussliebe",
    email: "hundert@example.ch",
    createdAt: daysBefore(NOW, 20),
  });
  const banned = await createUser(t.db, {
    handle: "spam_bot",
    displayName: "Spam Bot",
    email: "bot@spam.test",
    status: "banned",
    bannedReason: "Spam",
    bannedAt: daysBefore(NOW, 2),
    createdAt: daysBefore(NOW, 10),
  });

  const live = { currentPeriodEnd: daysAfter(NOW, 10) };
  await createActiveSubscription(t.db, luca.id, nina.id, live);
  await createActiveSubscription(t.db, percent.id, nina.id, live);
  // abgelaufen → zählt nicht
  await createActiveSubscription(t.db, banned.id, nina.id, { status: "expired", currentPeriodEnd: daysBefore(NOW, 3) });

  return { admin, adminUser, nina, lena, luca, percent, banned };
}

describe("searchUsers", () => {
  it("liefert alle Nutzer (neueste zuerst) mit Creator- und Abo-Infos", async () => {
    const f = await fixture();

    const { items, total } = await searchUsers(f.admin, undefined, { now: NOW });

    expect(total).toBe(6);
    expect(items.map((i) => i.handle)).toEqual(["spam_bot", "hundert", "luca_m", "lena_barfuss", "zehenspiel", "chefin"]);
    const nina = items.find((i) => i.id === f.nina.id)!;
    expect(nina).toMatchObject({
      handle: "zehenspiel",
      displayName: "Nina Zehnder",
      email: "nina@example.ch",
      status: "active",
      isAdmin: false,
      creator: { verificationStatus: "approved", isPremium: true, activeSubscribers: 2 },
      activeSubscriptions: 0,
    });
    expect(nina.createdAt).toEqual(daysBefore(NOW, 50));
    expect(items.find((i) => i.id === f.luca.id)).toMatchObject({ creator: null, activeSubscriptions: 1 });
    expect(items.find((i) => i.id === f.banned.id)).toMatchObject({ status: "banned", activeSubscriptions: 0 });
    expect(items.find((i) => i.id === f.lena.id)?.creator).toMatchObject({ verificationStatus: "pending", isPremium: false });
  });

  it("sucht in Handle, Anzeigename und E-Mail (ohne Gross-/Kleinschreibung)", async () => {
    const f = await fixture();

    const byHandle = await searchUsers(f.admin, { query: "@ZEHEN" }, { now: NOW });
    expect(byHandle.items.map((i) => i.id)).toEqual([f.nina.id]);

    const byName = await searchUsers(f.admin, { query: "müller" }, { now: NOW });
    expect(byName.items.map((i) => i.id)).toEqual([f.luca.id]);

    const byEmail = await searchUsers(f.admin, { query: "spam.test" }, { now: NOW });
    expect(byEmail.items.map((i) => i.id)).toEqual([f.banned.id]);
  });

  it("behandelt % und _ wörtlich", async () => {
    const f = await fixture();

    const percent = await searchUsers(f.admin, { query: "%" }, { now: NOW });
    expect(percent.items.map((i) => i.id)).toEqual([f.percent.id]);

    // Als Platzhalter würde "e_n" auf "Nina Zehnder" passen ("ehn")
    const wildcard = await searchUsers(f.admin, { query: "e_n" }, { now: NOW });
    expect(wildcard.total).toBe(0);
    expect(wildcard.items).toEqual([]);
    // Als Platzhalter würde "_b" auch "100% Fussliebe" treffen
    const realUnderscore = await searchUsers(f.admin, { query: "_b" }, { now: NOW });
    expect(realUnderscore.items.map((i) => i.handle)).toEqual(["spam_bot", "lena_barfuss"]);
  });

  it("filtert nach Creators, Admins und Gesperrten und paginiert", async () => {
    const f = await fixture();

    const creators = await searchUsers(f.admin, { filter: "creators" }, { now: NOW });
    expect(creators.items.map((i) => i.id).sort()).toEqual([f.nina.id, f.lena.id].sort());
    expect(creators.total).toBe(2);

    const admins = await searchUsers(f.admin, { filter: "admins" }, { now: NOW });
    expect(admins.items.map((i) => i.id)).toEqual([f.adminUser.id]);

    const banned = await searchUsers(f.admin, { filter: "banned" }, { now: NOW });
    expect(banned.items.map((i) => i.id)).toEqual([f.banned.id]);

    const page = await searchUsers(f.admin, { limit: 2, offset: 2 }, { now: NOW });
    expect(page.total).toBe(6);
    expect(page.items.map((i) => i.handle)).toEqual(["luca_m", "lena_barfuss"]);
  });
});

describe("banUser / unbanUser", () => {
  it("sperrt mit Grund und schreibt ein Audit; entsperren setzt zurück", async () => {
    const f = await fixture();

    await banUser(f.admin, f.luca.id, "  Belästigende Nachrichten  ", { now: NOW });

    let [row] = await t.db.select().from(users).where(eq(users.id, f.luca.id));
    expect(row).toMatchObject({ status: "banned", bannedReason: "Belästigende Nachrichten" });
    expect(row.bannedAt).toEqual(NOW);

    await expect(banUser(f.admin, f.luca.id, "nochmal", { now: NOW })).rejects.toBeInstanceOf(ConflictError);

    await unbanUser(f.admin, f.luca.id, { now: NOW });
    [row] = await t.db.select().from(users).where(eq(users.id, f.luca.id));
    expect(row).toMatchObject({ status: "active", bannedReason: null, bannedAt: null });

    await expect(unbanUser(f.admin, f.luca.id, { now: NOW })).rejects.toBeInstanceOf(ConflictError);

    const audit = await t.db.select().from(auditLog);
    expect(audit.map((a) => a.action).sort()).toEqual(["user.banned", "user.unbanned"]);
    const bannedEntry = audit.find((a) => a.action === "user.banned")!;
    expect(bannedEntry).toMatchObject({ actorId: f.admin.id, targetType: "user", targetId: f.luca.id });
    expect(bannedEntry.metadata).toMatchObject({ reason: "Belästigende Nachrichten" });
  });

  it("kündigt beim Sperren alle laufenden Abos (als Fan und als Creator) und den Premium-Plan zum Periodenende", async () => {
    const f = await fixture();
    // nina ist Premium-Creator mit 2 aktiven Abonnenten; luca hat ein Abo bei nina.
    await banUser(f.admin, f.nina.id, "Fremde Bilder", { now: NOW });

    const subs = await t.db.select().from(subscriptions).where(eq(subscriptions.creatorId, f.nina.id));
    const live = subs.filter((s) => s.currentPeriodEnd && s.currentPeriodEnd > NOW);
    expect(live.length).toBeGreaterThan(0);
    for (const s of live) {
      expect(s).toMatchObject({ status: "canceled", cancelAtPeriodEnd: true });
      expect(s.canceledAt).toEqual(NOW);
    }
    const [premium] = await t.db.select().from(premiumSubscriptions).where(eq(premiumSubscriptions.creatorId, f.nina.id));
    expect(premium).toMatchObject({ status: "canceled", cancelAtPeriodEnd: true });

    await banUser(f.admin, f.luca.id, "Spam", { now: NOW });
    const lucaSubs = await t.db.select().from(subscriptions).where(eq(subscriptions.fanId, f.luca.id));
    expect(lucaSubs.every((s) => s.status === "canceled" || s.status === "expired")).toBe(true);

    const entry = (await t.db.select().from(auditLog)).find((a) => a.action === "user.banned" && a.targetId === f.nina.id)!;
    expect(entry.metadata).toMatchObject({ canceledSubscriptions: live.length, canceledPremium: true });
  });

  it("verbietet Selbst-Sperre und das Sperren von Admins", async () => {
    const f = await fixture();
    const otherAdmin = await createAdmin(t.db, { handle: "zweite_admin" });

    await expect(banUser(f.admin, f.admin.id, "Test", { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(banUser(f.admin, otherAdmin.id, "Test", { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await t.db.select().from(auditLog)).toHaveLength(0);
  });

  it("verlangt einen Grund; unbekannte Nutzer → NotFoundError", async () => {
    const f = await fixture();
    await expect(banUser(f.admin, f.luca.id, "   ", { now: NOW })).rejects.toBeInstanceOf(ValidationError);
    await expect(banUser(f.admin, "00000000-0000-4000-8000-000000000000", "Grund")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(unbanUser(f.admin, "kaputt")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("quickSearch", () => {
  it("liefert max. 8 Treffer mit Link auf die Nutzerliste", async () => {
    const f = await fixture();
    for (let i = 0; i < 10; i++) await createUser(t.db, { handle: `fan_z_${i}`, displayName: `Fan von Zehen ${i}` });

    const hits = await quickSearch(f.admin, "zehen");

    expect(hits).toHaveLength(8);
    // exakter/präfix-Treffer auf dem Handle zuerst
    expect(hits[0]).toMatchObject({
      id: f.nina.id,
      label: "Nina Zehnder",
      href: "/admin/users?q=zehenspiel",
    });
    expect(hits[0].sublabel).toContain("@zehenspiel");
    expect(await quickSearch(f.admin, "   ")).toEqual([]);
  });

  it("verträgt Steuerzeichen wie NUL in der Suche (Postgres würde den Text sonst ablehnen)", async () => {
    const f = await fixture();
    expect(await quickSearch(f.admin, "\u0000")).toEqual([]);
    expect((await quickSearch(f.admin, "zehen\u0000spiel")).map((h) => h.id)).toEqual([f.nina.id]);
  });
});

describe("searchUsers mit Steuerzeichen", () => {
  it("bricht bei NUL nicht ab, sondern ignoriert die Steuerzeichen", async () => {
    const f = await fixture();
    expect((await searchUsers(f.admin, { query: "\u0000" }, { now: NOW })).total).toBe(6);
    expect((await searchUsers(f.admin, { query: "luca\u0000" }, { now: NOW })).items.map((i) => i.id)).toEqual([f.luca.id]);
  });
});

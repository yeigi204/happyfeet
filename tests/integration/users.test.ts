import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { users } from "@/server/db/schema";
import { ConflictError, ForbiddenError, ValidationError } from "@/server/errors";
import {
  completeOnboarding,
  deleteUserByClerkId,
  findViewerByClerkId,
  getBanDetails,
  HandleTakenError,
  isHandleAvailable,
  upsertUserFromClerk,
} from "@/server/services/users";

import { setupTestDb } from "../helpers/db";
import { createCreator, createUser, makePremium, viewerFor } from "../helpers/factories";

// setupTestDb ist kein React-Hook, sondern registriert Vitest-Hooks (Namenskonvention aus tests/helpers/db.ts).
const t = setupTestDb();

const NOW = new Date("2026-11-01T12:00:00Z");

const validInput = {
  handle: "anna_zh",
  displayName: "Anna aus Zürich",
  birthDate: "1995-04-12",
  confirmAdult: true,
};

/** Frisch angemeldeter Nutzer ohne Onboarding (wie nach dem ersten Clerk-Login). */
async function freshViewer(overrides: Partial<typeof users.$inferInsert> = {}) {
  const user = await createUser(t.db, {
    handle: null,
    displayName: null,
    birthDate: null,
    ageConfirmedAt: null,
    onboardedAt: null,
    ...overrides,
  });
  return viewerFor(t.db, user.id, NOW);
}

async function rowFor(id: string) {
  const [row] = await t.db.select().from(users).where(eq(users.id, id));
  return row;
}

async function expectValidation(promise: Promise<unknown>): Promise<ValidationError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ValidationError);
  return error as ValidationError;
}

describe("upsertUserFromClerk", () => {
  it("legt einen neuen Nutzer ohne Onboarding an", async () => {
    const user = await upsertUserFromClerk({ clerkId: "user_abc", email: "neu@example.ch" });
    expect(user).toMatchObject({
      clerkId: "user_abc",
      email: "neu@example.ch",
      handle: null,
      onboardedAt: null,
      isAdmin: false,
      status: "active",
    });
  });

  it("ist idempotent: zweiter Aufruf erzeugt keine zweite Zeile, aktualisiert aber die E-Mail", async () => {
    const first = await upsertUserFromClerk({ clerkId: "user_abc", email: "alt@example.ch" });
    const second = await upsertUserFromClerk({ clerkId: "user_abc", email: "neu@example.ch", imageUrl: null });
    expect(second.id).toBe(first.id);
    expect(second.email).toBe("neu@example.ch");
    const rows = await t.db.select().from(users).where(eq(users.clerkId, "user_abc"));
    expect(rows).toHaveLength(1);
  });

  it("behält die bekannte E-Mail, wenn Clerk keine liefert (z. B. Lazy-Anlage ohne Profil)", async () => {
    await upsertUserFromClerk({ clerkId: "user_abc", email: "bekannt@example.ch" });
    const again = await upsertUserFromClerk({ clerkId: "user_abc", email: null });
    expect(again.email).toBe("bekannt@example.ch");
  });

  it("überschreibt beim Update weder Profil noch Rechte noch Sperre", async () => {
    const existing = await createUser(t.db, {
      clerkId: "user_known",
      handle: "bestand",
      isAdmin: true,
      status: "banned",
      bannedReason: "Spam",
    });
    const updated = await upsertUserFromClerk({ clerkId: "user_known", email: "x@example.ch" });
    expect(updated).toMatchObject({
      id: existing.id,
      handle: "bestand",
      displayName: existing.displayName,
      isAdmin: true,
      status: "banned",
      bannedReason: "Spam",
    });
    expect(updated.onboardedAt).toEqual(existing.onboardedAt);
  });
});

describe("deleteUserByClerkId", () => {
  it("anonymisiert den Nutzer, statt ihn samt Creator-Profil zu löschen (Details: account-deletion.test.ts)", async () => {
    const { user } = await createCreator(t.db, { user: { clerkId: "user_del", email: "del@example.ch" } });
    await deleteUserByClerkId("user_del", { now: NOW });
    const row = await rowFor(user.id);
    expect(row).toMatchObject({ email: null, birthDate: null, deletedAt: NOW });
    expect(await findViewerByClerkId("user_del")).toBeNull();
  });

  it("tut nichts bei unbekannter Clerk-ID", async () => {
    const user = await createUser(t.db);
    await expect(deleteUserByClerkId("user_unknown")).resolves.toBeUndefined();
    expect(await rowFor(user.id)).toBeDefined();
  });
});

describe("isHandleAvailable", () => {
  it("ist true für einen freien, gültigen Handle", async () => {
    expect(await isHandleAvailable("frei_123")).toBe(true);
  });

  it("ist false für einen vergebenen Handle – auch mit @ und Grossbuchstaben", async () => {
    await createUser(t.db, { handle: "vergeben" });
    expect(await isHandleAvailable("vergeben")).toBe(false);
    expect(await isHandleAvailable(" @Vergeben ")).toBe(false);
  });

  it("ist false für reservierte und ungültige Handles", async () => {
    expect(await isHandleAvailable("admin")).toBe(false);
    expect(await isHandleAvailable("ab")).toBe(false);
    expect(await isHandleAvailable("mit leerzeichen")).toBe(false);
  });
});

describe("completeOnboarding", () => {
  it("setzt Profil, Geburtsdatum, onboardedAt und ageConfirmedAt und normalisiert den Handle", async () => {
    const viewer = await freshViewer();
    await completeOnboarding(
      viewer,
      { ...validInput, handle: "  @Anna_ZH ", displayName: "  Anna aus Zürich  " },
      { now: NOW },
    );
    const row = await rowFor(viewer.id);
    expect(row).toMatchObject({
      handle: "anna_zh",
      displayName: "Anna aus Zürich",
      birthDate: "1995-04-12",
    });
    expect(row.onboardedAt).toEqual(NOW);
    expect(row.ageConfirmedAt).toEqual(NOW);
  });

  it("akzeptiert genau den 18. Geburtstag (Kalendertag Europe/Zurich)", async () => {
    const viewer = await freshViewer();
    await completeOnboarding(viewer, { ...validInput, birthDate: "2008-11-01" }, { now: NOW });
    expect((await rowFor(viewer.id)).onboardedAt).toEqual(NOW);
  });

  it("lehnt unter 18-Jährige mit fieldErrors.birthDate ab", async () => {
    const viewer = await freshViewer();
    const error = await expectValidation(
      completeOnboarding(viewer, { ...validInput, birthDate: "2008-11-02" }, { now: NOW }),
    );
    expect(error.fieldErrors.birthDate?.[0]).toMatch(/18/);
    expect((await rowFor(viewer.id)).onboardedAt).toBeNull();
  });

  it("lehnt ungültige und zukünftige Daten mit fieldErrors.birthDate ab", async () => {
    const viewer = await freshViewer();
    for (const birthDate of ["2000-02-30", "12.04.1995", "", "2030-01-01", "1850-01-01"]) {
      const error = await expectValidation(completeOnboarding(viewer, { ...validInput, birthDate }, { now: NOW }));
      expect(error.fieldErrors.birthDate, birthDate).toBeDefined();
    }
  });

  it("lehnt reservierte Handles mit fieldErrors.handle ab", async () => {
    const viewer = await freshViewer();
    const error = await expectValidation(
      completeOnboarding(viewer, { ...validInput, handle: "Admin" }, { now: NOW }),
    );
    expect(error.fieldErrors.handle).toBeDefined();
  });

  it("lehnt ungültige Handles mit fieldErrors.handle ab", async () => {
    const viewer = await freshViewer();
    for (const handle of ["ab", "anna-zh", "ä_umlaut", "x".repeat(25)]) {
      const error = await expectValidation(completeOnboarding(viewer, { ...validInput, handle }, { now: NOW }));
      expect(error.fieldErrors.handle, handle).toBeDefined();
    }
  });

  it("verlangt einen Anzeigenamen mit 2–40 Zeichen", async () => {
    const viewer = await freshViewer();
    for (const displayName of ["A", "   ", "x".repeat(41)]) {
      const error = await expectValidation(
        completeOnboarding(viewer, { ...validInput, displayName }, { now: NOW }),
      );
      expect(error.fieldErrors.displayName, JSON.stringify(displayName)).toBeDefined();
    }
  });

  it("lehnt Steuer- und Richtungszeichen im Anzeigenamen ab", async () => {
    const viewer = await freshViewer();
    for (const displayName of ["Anna\u0000", "Anna\nAdmin", "Anna\u202Enimda"]) {
      const error = await expectValidation(
        completeOnboarding(viewer, { ...validInput, displayName }, { now: NOW }),
      );
      expect(error.fieldErrors.displayName, JSON.stringify(displayName)).toBeDefined();
    }
    expect((await rowFor(viewer.id)).onboardedAt).toBeNull();
  });

  it("erlaubt Umlaute und Emoji im Anzeigenamen", async () => {
    const viewer = await freshViewer();
    await completeOnboarding(viewer, { ...validInput, displayName: "Zoë 👣🏽 Grüezi" }, { now: NOW });
    expect((await rowFor(viewer.id)).displayName).toBe("Zoë 👣🏽 Grüezi");
  });

  it("verlangt die 18+-Bestätigung", async () => {
    const viewer = await freshViewer();
    const error = await expectValidation(
      completeOnboarding(viewer, { ...validInput, confirmAdult: false }, { now: NOW }),
    );
    expect(error.fieldErrors.confirmAdult).toBeDefined();
  });

  it("meldet mehrere Feldfehler gleichzeitig", async () => {
    const viewer = await freshViewer();
    const error = await expectValidation(
      completeOnboarding(
        viewer,
        { handle: "x", displayName: "", birthDate: "2010-01-01", confirmAdult: false },
        { now: NOW },
      ),
    );
    expect(Object.keys(error.fieldErrors).sort()).toEqual(["birthDate", "confirmAdult", "displayName", "handle"]);
  });

  it("wirft ConflictError, wenn der Handle schon vergeben ist", async () => {
    await createUser(t.db, { handle: "anna_zh" });
    const viewer = await freshViewer();
    const error = await completeOnboarding(viewer, validInput, { now: NOW }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toBeInstanceOf(HandleTakenError);
    expect((await rowFor(viewer.id)).onboardedAt).toBeNull();
  });

  it("lässt bei gleichzeitigen Onboardings mit gleichem Handle genau eines gewinnen", async () => {
    const a = await freshViewer();
    const b = await freshViewer();
    const results = await Promise.allSettled([
      completeOnboarding(a, validInput, { now: NOW }),
      completeOnboarding(b, validInput, { now: NOW }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(HandleTakenError);
    const owners = await t.db.select().from(users).where(eq(users.handle, "anna_zh"));
    expect(owners).toHaveLength(1);
  });

  it("lässt bei doppeltem Absenden desselben Nutzers nur das erste Onboarding gelten", async () => {
    const viewer = await freshViewer();
    const results = await Promise.allSettled([
      completeOnboarding(viewer, { ...validInput, handle: "erster" }, { now: NOW }),
      completeOnboarding(viewer, { ...validInput, handle: "zweiter" }, { now: NOW }),
    ]);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    const reason = (results[1] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(ConflictError);
    expect(reason).not.toBeInstanceOf(HandleTakenError);
    expect((await rowFor(viewer.id)).handle).toBe("erster");
    expect(await isHandleAvailable("zweiter")).toBe(true);
  });

  it("wirft ConflictError (kein HandleTakenError), wenn das Onboarding schon abgeschlossen ist", async () => {
    const user = await createUser(t.db);
    const viewer = await viewerFor(t.db, user.id, NOW);
    const error = await completeOnboarding(viewer, validInput, { now: NOW }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error).not.toBeInstanceOf(HandleTakenError);
  });

  it("verweigert gesperrten Nutzern das Onboarding", async () => {
    const viewer = await freshViewer({ status: "banned" });
    await expect(completeOnboarding(viewer, validInput, { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("findViewerByClerkId", () => {
  it("liefert null für unbekannte Clerk-IDs", async () => {
    expect(await findViewerByClerkId("user_unknown", { now: NOW })).toBeNull();
  });

  it("baut den Viewer eines Fans ohne Creator-Profil", async () => {
    const user = await createUser(t.db, { clerkId: "user_fan" });
    expect(await findViewerByClerkId("user_fan", { now: NOW })).toEqual(await viewerFor(t.db, user.id, NOW));
  });

  it("erkennt nicht onboardete Nutzer", async () => {
    await createUser(t.db, { clerkId: "user_new", handle: null, onboardedAt: null });
    expect(await findViewerByClerkId("user_new", { now: NOW })).toMatchObject({ onboarded: false, handle: null });
  });

  it("liefert Creator-Status und aktives Premium", async () => {
    const { user } = await createCreator(t.db, {
      user: { clerkId: "user_creator" },
      profile: { verificationStatus: "pending" },
    });
    await makePremium(t.db, user.id, { now: NOW, days: 10 });
    expect(await findViewerByClerkId("user_creator", { now: NOW })).toMatchObject({
      creator: { verificationStatus: "pending", isPremium: true },
    });
  });

  it("wertet abgelaufenes Premium als Standard", async () => {
    const { user } = await createCreator(t.db, { user: { clerkId: "user_expired" } });
    await makePremium(t.db, user.id, { now: new Date(NOW.getTime() - 40 * 24 * 3600 * 1000), days: 29 });
    expect(await findViewerByClerkId("user_expired", { now: NOW })).toMatchObject({
      creator: { verificationStatus: "approved", isPremium: false },
    });
  });
});

describe("getBanDetails", () => {
  it("liefert Grund und Zeitpunkt der Sperre", async () => {
    const bannedAt = new Date("2026-10-20T08:30:00Z");
    const user = await createUser(t.db, { status: "banned", bannedReason: "Fremde Inhalte", bannedAt });
    const viewer = await viewerFor(t.db, user.id, NOW);
    expect(await getBanDetails(viewer)).toEqual({ reason: "Fremde Inhalte", bannedAt });
  });

  it("liefert null für nicht gesperrte Nutzer", async () => {
    const user = await createUser(t.db);
    expect(await getBanDetails(await viewerFor(t.db, user.id, NOW))).toBeNull();
  });
});

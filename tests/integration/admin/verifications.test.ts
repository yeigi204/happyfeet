import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { auditLog, creatorProfiles } from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { approveCreator, listVerificationQueue, rejectCreator } from "@/server/services/admin/verifications";

import { setupTestDb } from "../../helpers/db";
import { createAdmin, createCreator, viewerFor } from "../../helpers/factories";
import { daysBefore } from "../../helpers/task9";

const t = setupTestDb();
const NOW = new Date("2026-11-04T10:00:00Z");

async function fixture() {
  const admin = await viewerFor(t.db, (await createAdmin(t.db, { handle: "chefin" })).id, NOW);
  const { user: older } = await createCreator(t.db, {
    user: { handle: "zehenspiel", displayName: "Nina Zehnder", email: "nina@example.ch", birthDate: "1996-11-05" },
    profile: {
      verificationStatus: "pending",
      verifiedAt: null,
      bio: "Barfuss am Zürichsee.",
      monthlyPriceRappen: 1490,
      createdAt: daysBefore(NOW, 4),
      updatedAt: daysBefore(NOW, 4),
    },
  });
  const { user: newer } = await createCreator(t.db, {
    user: { handle: "lena_barfuss", displayName: "Lena Baumann", birthDate: "2000-01-01" },
    profile: {
      verificationStatus: "pending",
      verifiedAt: null,
      createdAt: daysBefore(NOW, 1),
      updatedAt: daysBefore(NOW, 1),
    },
  });
  const { user: approved } = await createCreator(t.db, { user: { handle: "schon_frei" } });
  const { user: rejected } = await createCreator(t.db, {
    user: { handle: "abgelehnt" },
    profile: { verificationStatus: "rejected", verificationNote: "Unscharfes Ausweisfoto", verifiedAt: daysBefore(NOW, 2) },
  });
  return { admin, older, newer, approved, rejected };
}

describe("listVerificationQueue", () => {
  it("liefert offene Anträge, älteste zuerst, mit berechnetem Alter", async () => {
    const { admin, older, newer } = await fixture();

    const items = await listVerificationQueue(admin, undefined, { now: NOW });

    expect(items.map((i) => i.userId)).toEqual([older.id, newer.id]);
    expect(items[0]).toMatchObject({
      userId: older.id,
      handle: "zehenspiel",
      displayName: "Nina Zehnder",
      email: "nina@example.ch",
      birthDate: "1996-11-05",
      // Geburtstag am 05.11. – am 04.11.2026 noch 29
      age: 29,
      bio: "Barfuss am Zürichsee.",
      monthlyPriceRappen: 1490,
      status: "pending",
      note: null,
      verifiedAt: null,
    });
    expect(items[0].appliedAt).toEqual(daysBefore(NOW, 4));
  });

  it("filtert nach Status", async () => {
    const { admin, approved, rejected } = await fixture();

    const rejectedItems = await listVerificationQueue(admin, { status: "rejected" }, { now: NOW });
    expect(rejectedItems.map((i) => i.userId)).toEqual([rejected.id]);
    expect(rejectedItems[0].note).toBe("Unscharfes Ausweisfoto");

    const approvedItems = await listVerificationQueue(admin, { status: "approved" }, { now: NOW });
    expect(approvedItems.map((i) => i.userId)).toEqual([approved.id]);
  });
});

describe("approveCreator", () => {
  it("setzt Status, Prüfer, Zeitpunkt, Notiz und schreibt ein Audit", async () => {
    const { admin, older } = await fixture();

    await approveCreator(admin, older.id, "Ausweis geprüft", { now: NOW });

    const [profile] = await t.db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, older.id));
    expect(profile).toMatchObject({
      verificationStatus: "approved",
      verificationNote: "Ausweis geprüft",
      verifiedBy: admin.id,
    });
    expect(profile.verifiedAt).toEqual(NOW);

    const audit = await t.db.select().from(auditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: admin.id,
      action: "creator.approved",
      targetType: "creator",
      targetId: older.id,
    });
  });

  it("geht nur für offene Anträge", async () => {
    const { admin, approved, rejected } = await fixture();
    await expect(approveCreator(admin, approved.id, undefined, { now: NOW })).rejects.toBeInstanceOf(ConflictError);
    await expect(approveCreator(admin, rejected.id, undefined, { now: NOW })).rejects.toBeInstanceOf(ConflictError);
    expect(await t.db.select().from(auditLog)).toHaveLength(0);
  });

  it("unbekannte oder ungültige IDs → NotFoundError", async () => {
    const { admin } = await fixture();
    await expect(approveCreator(admin, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(NotFoundError);
    await expect(approveCreator(admin, "kein-uuid")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("rejectCreator", () => {
  it("ohne Notiz → ValidationError, Status bleibt", async () => {
    const { admin, older } = await fixture();

    const error = await rejectCreator(admin, older.id, "   ", { now: NOW }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors.note).toBeDefined();

    const [profile] = await t.db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, older.id));
    expect(profile.verificationStatus).toBe("pending");
    expect(await t.db.select().from(auditLog)).toHaveLength(0);
  });

  it("setzt Status und Notiz und schreibt ein Audit", async () => {
    const { admin, newer } = await fixture();

    await rejectCreator(admin, newer.id, "  Bitte Profilbild ohne Filter hochladen.  ", { now: NOW });

    const [profile] = await t.db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, newer.id));
    expect(profile).toMatchObject({
      verificationStatus: "rejected",
      verificationNote: "Bitte Profilbild ohne Filter hochladen.",
      verifiedBy: admin.id,
    });
    const [audit] = await t.db.select().from(auditLog);
    expect(audit).toMatchObject({ action: "creator.rejected", targetId: newer.id, actorId: admin.id });
    expect(audit.metadata).toMatchObject({ note: "Bitte Profilbild ohne Filter hochladen." });
  });
});

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { auditLog, payouts, users } from "@/server/db/schema";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors";
import {
  generateDuePayouts,
  getCreatorBalance,
  listCreatorPayouts,
  markPayoutPaid,
} from "@/server/services/payouts";

import { setupTestDb } from "../helpers/db";
import { createAdmin, createCreator, createUser, makePremium, viewerFor } from "../helpers/factories";
import { insertFanPayment } from "../helpers/task8";

const t = setupTestDb();
/** Mittwoch → letzte Monatsgrenze 01.11., letzte Wochengrenze Mo 02.11. */
const NOW = new Date("2026-11-04T10:00:00Z");
const d = (iso: string) => new Date(iso);

async function standardCreatorWithPayments() {
  const { user } = await createCreator(t.db, { user: { handle: "std_creator" } });
  await insertFanPayment(t.db, { creatorId: user.id, createdAt: d("2026-10-05T09:00:00Z") }); // net 841
  await insertFanPayment(t.db, { creatorId: user.id, createdAt: d("2026-10-20T18:30:00Z") }); // net 841
  await insertFanPayment(t.db, { creatorId: user.id, createdAt: d("2026-11-03T12:00:00Z") }); // nach der Grenze
  return user;
}

async function premiumCreatorWithPayments() {
  const { user } = await createCreator(t.db, { user: { handle: "prem_creator" } });
  await makePremium(t.db, user.id, { now: NOW });
  await insertFanPayment(t.db, { creatorId: user.id, plan: "premium", createdAt: d("2026-10-28T10:00:00Z") }); // 940
  await insertFanPayment(t.db, { creatorId: user.id, plan: "premium", createdAt: d("2026-11-01T22:00:00Z") }); // 940
  await insertFanPayment(t.db, { creatorId: user.id, plan: "premium", createdAt: d("2026-11-02T00:00:00Z") }); // Grenze → nächste Periode
  return user;
}

async function adminViewer() {
  return viewerFor(t.db, (await createAdmin(t.db)).id, NOW);
}

describe("generateDuePayouts", () => {
  it("Standard-Creator: monatlich bis zum 1. des Monats", async () => {
    const creator = await standardCreatorWithPayments();

    expect(await generateDuePayouts(null, { now: NOW })).toEqual({ created: 1, totalRappen: 1682 });

    const [payout] = await t.db.select().from(payouts);
    expect(payout).toMatchObject({
      creatorId: creator.id,
      amountRappen: 1682,
      currency: "CHF",
      schedule: "monthly",
      status: "scheduled",
      paidAt: null,
    });
    expect(payout.periodStart).toEqual(d("2026-10-05T09:00:00Z"));
    expect(payout.periodEnd).toEqual(d("2026-11-01T00:00:00Z"));
  });

  it("Premium-Creator: wöchentlich bis zum letzten Montag", async () => {
    const creator = await premiumCreatorWithPayments();

    expect(await generateDuePayouts(null, { now: NOW })).toEqual({ created: 1, totalRappen: 1880 });

    const [payout] = await t.db.select().from(payouts);
    expect(payout).toMatchObject({ creatorId: creator.id, schedule: "weekly", amountRappen: 1880 });
    expect(payout.periodEnd).toEqual(d("2026-11-02T00:00:00Z"));
  });

  it("zahlt dieselbe Periode nie doppelt aus", async () => {
    await standardCreatorWithPayments();
    await premiumCreatorWithPayments();

    expect(await generateDuePayouts(null, { now: NOW })).toEqual({ created: 2, totalRappen: 1682 + 1880 });
    expect(await generateDuePayouts(null, { now: NOW })).toEqual({ created: 0, totalRappen: 0 });
    expect(await generateDuePayouts(null, { now: d("2026-11-04T23:00:00Z") })).toEqual({ created: 0, totalRappen: 0 });
    expect(await t.db.select().from(payouts)).toHaveLength(2);
  });

  it("die nächste Periode beginnt am Ende der letzten Auszahlung", async () => {
    const creator = await standardCreatorWithPayments();
    await generateDuePayouts(null, { now: NOW });

    const later = d("2026-12-03T08:00:00Z");
    expect(await generateDuePayouts(null, { now: later })).toEqual({ created: 1, totalRappen: 841 });

    const rows = await listCreatorPayouts(await viewerFor(t.db, creator.id, later), { now: later });
    expect(rows).toHaveLength(2);
    expect(rows[0].periodStart).toEqual(d("2026-11-01T00:00:00Z"));
    expect(rows[0].periodEnd).toEqual(d("2026-12-01T00:00:00Z"));
  });

  it("fehlgeschlagene Auszahlungen geben ihre Periode wieder frei", async () => {
    await standardCreatorWithPayments();
    await generateDuePayouts(null, { now: NOW });
    await t.db.update(payouts).set({ status: "failed" });

    expect(await generateDuePayouts(null, { now: NOW })).toEqual({ created: 1, totalRappen: 1682 });
    expect(await t.db.select().from(payouts)).toHaveLength(2);
  });

  it("verspätet gebuchte Zahlungen aus einer schon ausgezahlten Periode gehen nicht verloren", async () => {
    const creator = await standardCreatorWithPayments();
    expect(await generateDuePayouts(null, { now: NOW })).toEqual({ created: 1, totalRappen: 1682 });

    // Verspäteter Webhook: created_at = occurredAt (31.10.) liegt vor dem Ende der letzten Auszahlung.
    await insertFanPayment(t.db, { creatorId: creator.id, createdAt: d("2026-10-31T23:00:00Z") });

    const later = d("2026-12-03T08:00:00Z");
    // November-Zahlung (03.11.) + nachgereichte Oktober-Zahlung
    expect(await generateDuePayouts(null, { now: later })).toEqual({ created: 1, totalRappen: 841 + 841 });

    const viewer = await viewerFor(t.db, creator.id, later);
    const [latest] = await listCreatorPayouts(viewer, { now: later });
    expect(latest.periodStart).toEqual(d("2026-11-01T00:00:00Z"));
    expect(latest.periodEnd).toEqual(d("2026-12-01T00:00:00Z"));
    // Alles bis zur Grenze ist verplant – nichts bleibt dauerhaft „verfügbar“ hängen.
    expect((await getCreatorBalance(viewer, { now: later })).availableRappen).toBe(0);
  });

  it("eine fehlgeschlagene ältere Auszahlung wird mit der nächsten Periode nachgeholt", async () => {
    const creator = await standardCreatorWithPayments();
    await generateDuePayouts(null, { now: NOW }); // Okt.: 1682
    await generateDuePayouts(null, { now: d("2026-12-03T08:00:00Z") }); // Nov.: 841
    const [october] = await t.db.select().from(payouts).where(eq(payouts.amountRappen, 1682));
    await t.db.update(payouts).set({ status: "failed" }).where(eq(payouts.id, october.id));

    // Die Dezember-Periode enthält keine neuen Zahlungen, holt aber den fehlgeschlagenen Oktober nach.
    expect(await generateDuePayouts(null, { now: d("2027-01-04T08:00:00Z") })).toEqual({
      created: 1,
      totalRappen: 1682,
    });
    const viewer = await viewerFor(t.db, creator.id, d("2027-01-04T08:00:00Z"));
    expect(await getCreatorBalance(viewer, { now: d("2027-01-04T08:00:00Z") })).toMatchObject({
      availableRappen: 0,
      scheduledRappen: 3 * 841,
    });
  });

  it("ignoriert Rückerstattungen und erzeugt ohne Guthaben nichts", async () => {
    const { user } = await createCreator(t.db);
    await insertFanPayment(t.db, { creatorId: user.id, createdAt: d("2026-10-10T10:00:00Z"), status: "refunded" });
    const { user: fresh } = await createCreator(t.db);
    await insertFanPayment(t.db, { creatorId: fresh.id, createdAt: d("2026-11-03T10:00:00Z") });

    expect(await generateDuePayouts(null, { now: NOW })).toEqual({ created: 0, totalRappen: 0 });
  });

  it("gesperrte Creator werden zurückgestellt (Guthaben bleibt erhalten)", async () => {
    const creator = await standardCreatorWithPayments();
    await t.db.update(users).set({ status: "banned" }).where(eq(users.id, creator.id));
    expect(await generateDuePayouts(null, { now: NOW })).toEqual({ created: 0, totalRappen: 0 });

    await t.db.update(users).set({ status: "active" }).where(eq(users.id, creator.id));
    expect(await generateDuePayouts(null, { now: NOW })).toEqual({ created: 1, totalRappen: 1682 });
  });

  it("Admin darf auslösen (mit Audit), Nicht-Admins nicht", async () => {
    await standardCreatorWithPayments();
    const fan = await viewerFor(t.db, (await createUser(t.db)).id, NOW);
    await expect(generateDuePayouts(fan, { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await t.db.select().from(payouts)).toHaveLength(0);

    const admin = await adminViewer();
    await generateDuePayouts(admin, { now: NOW });

    const [entry] = await t.db.select().from(auditLog).where(eq(auditLog.action, "payouts.generated"));
    expect(entry).toMatchObject({ actorId: admin.id, metadata: { created: 1, totalRappen: 1682 } });
  });
});

describe("markPayoutPaid", () => {
  it("markiert als bezahlt und protokolliert", async () => {
    await standardCreatorWithPayments();
    await generateDuePayouts(null, { now: NOW });
    const [payout] = await t.db.select().from(payouts);
    const admin = await adminViewer();

    await markPayoutPaid(admin, payout.id, { now: NOW });

    const [row] = await t.db.select().from(payouts);
    expect(row).toMatchObject({ status: "paid", paidBy: admin.id });
    expect(row.paidAt).toEqual(NOW);
    const [entry] = await t.db.select().from(auditLog).where(eq(auditLog.action, "payout.paid"));
    expect(entry).toMatchObject({ actorId: admin.id, targetType: "payout", targetId: payout.id });
  });

  it("doppelt → ConflictError, unbekannt → NotFoundError, Nicht-Admin → ForbiddenError", async () => {
    await standardCreatorWithPayments();
    await generateDuePayouts(null, { now: NOW });
    const [payout] = await t.db.select().from(payouts);
    const admin = await adminViewer();

    const fan = await viewerFor(t.db, (await createUser(t.db)).id, NOW);
    await expect(markPayoutPaid(fan, payout.id, { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);

    await markPayoutPaid(admin, payout.id, { now: NOW });
    await expect(markPayoutPaid(admin, payout.id, { now: NOW })).rejects.toBeInstanceOf(ConflictError);
    await expect(
      markPayoutPaid(admin, "00000000-0000-4000-8000-000000000000", { now: NOW }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(markPayoutPaid(admin, "kein-uuid", { now: NOW })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("getCreatorBalance", () => {
  it("teilt das Guthaben in verfügbar, geplant und ausbezahlt", async () => {
    const creator = await standardCreatorWithPayments();
    const viewer = await viewerFor(t.db, creator.id, NOW);

    expect(await getCreatorBalance(viewer, { now: NOW })).toEqual({
      availableRappen: 3 * 841,
      scheduledRappen: 0,
      paidRappen: 0,
      schedule: "monthly",
      nextPayoutDate: d("2026-12-01T00:00:00Z"),
    });

    await generateDuePayouts(null, { now: NOW });
    expect(await getCreatorBalance(viewer, { now: NOW })).toMatchObject({
      availableRappen: 841,
      scheduledRappen: 1682,
      paidRappen: 0,
    });

    const [payout] = await t.db.select().from(payouts);
    await markPayoutPaid(await adminViewer(), payout.id, { now: NOW });
    expect(await getCreatorBalance(viewer, { now: NOW })).toMatchObject({
      availableRappen: 841,
      scheduledRappen: 0,
      paidRappen: 1682,
    });
  });

  it("Premium: wöchentlicher Rhythmus", async () => {
    const creator = await premiumCreatorWithPayments();
    const balance = await getCreatorBalance(await viewerFor(t.db, creator.id, NOW), { now: NOW });
    expect(balance).toMatchObject({ schedule: "weekly", nextPayoutDate: d("2026-11-09T00:00:00Z") });
  });

  it("nur für Creator", async () => {
    const fan = await viewerFor(t.db, (await createUser(t.db)).id, NOW);
    await expect(getCreatorBalance(fan, { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listCreatorPayouts(fan, { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("listCreatorPayouts", () => {
  it("liefert nur eigene Auszahlungen", async () => {
    const std = await standardCreatorWithPayments();
    const prem = await premiumCreatorWithPayments();
    await generateDuePayouts(null, { now: NOW });

    const mine = await listCreatorPayouts(await viewerFor(t.db, std.id, NOW), { now: NOW });
    expect(mine).toHaveLength(1);
    expect(mine[0].creatorId).toBe(std.id);
    const theirs = await listCreatorPayouts(await viewerFor(t.db, prem.id, NOW), { now: NOW });
    expect(theirs.map((p) => p.creatorId)).toEqual([prem.id]);
  });
});

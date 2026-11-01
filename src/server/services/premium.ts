import "server-only";

import { and, desc, eq, gt, inArray, lte } from "drizzle-orm";

import { isPremiumActive } from "@/lib/domain/plans";
import type { Viewer } from "@/lib/domain/types";
import { assertApprovedCreator, assertCreator } from "@/server/auth/guards";
import { getDb, type DbOrTx } from "@/server/db/client";
import { premiumSubscriptions, type PremiumSubscription } from "@/server/db/schema";
import { ConflictError } from "@/server/errors";
import { getPaymentProvider } from "@/server/payments";

import { writeAudit } from "./audit";
import { getPlatformSettings } from "./settings";
import { appBaseUrl } from "./subscriptions";

/**
 * Premium-Plan eines Creators (Creator → Plattform). Aktiviert/verlängert wird er ausschliesslich
 * über Zahlungs-Events (`payment-events.ts`); pro Creator und Provider gibt es genau eine Zeile.
 */

export type PremiumStatus = {
  isPremium: boolean;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** Laufendes Premium: eingefrorener Preis; sonst der aktuelle Premium-Preis aus den Einstellungen. */
  priceRappen: number;
  standardFeeBps: number;
  premiumFeeBps: number;
};

/**
 * IDs der Creator, deren Premium zum Zeitpunkt `at` läuft (aktiv oder gekündigt, Periode nicht vorbei,
 * und die laufende Premium-Strecke hatte zu `at` schon begonnen – wichtig für verspätete Zahlungs-Events).
 */
export async function premiumCreatorIdsAt(
  creatorIds: readonly string[],
  at: Date,
  db: DbOrTx = getDb(),
): Promise<Set<string>> {
  const ids = [...new Set(creatorIds)];
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({
      creatorId: premiumSubscriptions.creatorId,
      status: premiumSubscriptions.status,
      currentPeriodEnd: premiumSubscriptions.currentPeriodEnd,
    })
    .from(premiumSubscriptions)
    .where(
      and(
        inArray(premiumSubscriptions.creatorId, ids),
        inArray(premiumSubscriptions.status, ["active", "canceled"]),
        gt(premiumSubscriptions.currentPeriodEnd, at),
        lte(premiumSubscriptions.activeSince, at),
      ),
    );
  return new Set(rows.filter((row) => isPremiumActive(row, at)).map((row) => row.creatorId));
}

/** Läuft das Premium des Creators zum Zeitpunkt `at`? */
export async function isCreatorPremiumAt(creatorId: string, at: Date, db: DbOrTx = getDb()): Promise<boolean> {
  return (await premiumCreatorIdsAt([creatorId], at, db)).has(creatorId);
}

/** Die laufende Premium-Zeile (mit dem spätesten Periodenende) oder `null`. */
async function runningPremium(db: DbOrTx, creatorId: string, now: Date): Promise<PremiumSubscription | null> {
  const [row] = await db
    .select()
    .from(premiumSubscriptions)
    .where(
      and(
        eq(premiumSubscriptions.creatorId, creatorId),
        inArray(premiumSubscriptions.status, ["active", "canceled"]),
        gt(premiumSubscriptions.currentPeriodEnd, now),
      ),
    )
    .orderBy(desc(premiumSubscriptions.currentPeriodEnd))
    .limit(1);
  return row && isPremiumActive(row, now) ? row : null;
}

export async function getPremiumStatus(viewer: Viewer, opts: { now?: Date } = {}): Promise<PremiumStatus> {
  assertCreator(viewer);
  const now = opts.now ?? new Date();
  const db = getDb();
  const settings = await getPlatformSettings(db);
  const running = await runningPremium(db, viewer.id, now);
  return {
    isPremium: running !== null,
    currentPeriodEnd: running?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: running?.cancelAtPeriodEnd ?? false,
    priceRappen: running?.priceRappen ?? settings.premiumPriceRappen,
    standardFeeBps: settings.standardFeeBps,
    premiumFeeBps: settings.premiumFeeBps,
  };
}

/** Checkout für einen Monat Premium zum aktuellen Premium-Preis. Nur freigegebene Creator ohne laufendes Premium. */
export async function startPremiumCheckout(
  viewer: Viewer,
  opts: { now?: Date; appUrl?: string } = {},
): Promise<{ redirectUrl: string }> {
  assertApprovedCreator(viewer);
  const now = opts.now ?? new Date();
  const db = getDb();
  const running = await runningPremium(db, viewer.id, now);
  if (running) {
    throw new ConflictError(
      running.cancelAtPeriodEnd
        ? "Dein Premium läuft noch bis zum Ende der bezahlten Periode."
        : "Du hast Premium bereits.",
    );
  }

  const settings = await getPlatformSettings(db);
  const base = appBaseUrl(opts.appUrl);
  const session = await getPaymentProvider().createCheckout({
    kind: "premium_plan",
    referenceId: viewer.id,
    payerUserId: viewer.id,
    amountRappen: settings.premiumPriceRappen,
    currency: "CHF",
    description: "happyfeet Premium – 1 Monat",
    successUrl: `${base}/studio/premium?ok=1`,
    cancelUrl: `${base}/studio/premium`,
  });
  return { redirectUrl: session.redirectUrl };
}

/** Kündigt Premium zum Periodenende; bis dahin bleiben alle Vorteile. Erneutes Kündigen ist ein No-op. */
export async function cancelPremium(viewer: Viewer, opts: { now?: Date } = {}): Promise<void> {
  assertCreator(viewer);
  const now = opts.now ?? new Date();
  const db = getDb();
  const running = await runningPremium(db, viewer.id, now);
  if (!running) throw new ConflictError("Du hast kein laufendes Premium.");
  if (running.status === "canceled") return;

  // Zuerst beim Anbieter kündigen: schlägt das fehl, bleibt Premium bei uns unverändert.
  if (running.providerRef) await getPaymentProvider(running.provider).cancelSubscription(running.providerRef);

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(premiumSubscriptions)
      .set({ status: "canceled", cancelAtPeriodEnd: true, canceledAt: now })
      .where(and(eq(premiumSubscriptions.id, running.id), eq(premiumSubscriptions.status, "active")))
      .returning({ id: premiumSubscriptions.id });
    if (updated.length === 0) return;
    await writeAudit(
      {
        actorId: viewer.id,
        action: "premium.canceled",
        targetType: "premium",
        targetId: running.id,
        metadata: { source: "creator", currentPeriodEnd: running.currentPeriodEnd.toISOString() },
      },
      tx,
    );
  });
}

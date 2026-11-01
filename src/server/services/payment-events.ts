import "server-only";

import { and, eq } from "drizzle-orm";

import { feeBpsForPlan, splitPayment } from "@/lib/domain/fees";
import { isPremiumActive, planOf } from "@/lib/domain/plans";
import { addBillingMonth, isSubscriptionActive } from "@/lib/domain/subscriptions";
import type { Viewer } from "@/lib/domain/types";
import { assertOnboarded } from "@/server/auth/guards";
import { getDb, type Tx } from "@/server/db/client";
import { creatorProfiles, payments, premiumSubscriptions, subscriptions, users } from "@/server/db/schema";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { getMockProvider, type CheckoutKind, type PaymentEvent } from "@/server/payments";

import { writeAudit } from "./audit";
import { isCreatorPremiumAt } from "./premium";
import { getPlatformSettings } from "./settings";

/**
 * Verarbeitet Zahlungs-Events (Webhook bzw. Mock-Checkout) – jedes Event in genau einer Transaktion.
 *
 * Idempotenz:
 * - Zahlungen über den eindeutigen Index `(provider, provider_payment_id)`: ein bekanntes Event wird
 *   ohne Änderung mit `{ applied: false }` beantwortet; ein paralleles Duplikat rollt die ganze
 *   Transaktion zurück (keine halben Schreibvorgänge).
 * - Kündigungen über den Zustand (nur `active` → `canceled`).
 *
 * Unpassende Events (unbekanntes Abo, fremder Zahler, zweite Zahlung für ein schon aktives Abo …)
 * werden mit `console.warn` protokolliert und nicht angewendet – der Anbieter bekommt trotzdem 200,
 * damit er sie nicht endlos wiederholt.
 */

type CompletedEvent = Extract<PaymentEvent, { type: "checkout.completed" }>;
type RenewedEvent = Extract<PaymentEvent, { type: "subscription.renewed" }>;
type CanceledEvent = Extract<PaymentEvent, { type: "subscription.canceled" }>;
type Result = { applied: boolean };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREMIUM_PLAN_FEE_BPS = 10_000;
const NOT_APPLIED: Result = { applied: false };
const APPLIED: Result = { applied: true };

/** Wird innerhalb der Transaktion geworfen, wenn ein paralleles Duplikat die Zahlung schon gebucht hat. */
class DuplicatePaymentError extends Error {
  constructor() {
    super("Zahlung ist bereits gebucht.");
    this.name = "DuplicatePaymentError";
  }
}

function ignore(reason: string, event: PaymentEvent): Result {
  console.warn(`[payments] Event nicht angewendet: ${reason}`, {
    type: event.type,
    kind: event.kind,
    provider: event.provider,
    eventId: event.eventId,
    providerSubscriptionRef: event.providerSubscriptionRef,
  });
  return NOT_APPLIED;
}

async function paymentExists(tx: Tx, provider: string, providerPaymentId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.provider, provider), eq(payments.providerPaymentId, providerPaymentId)))
    .limit(1);
  return row !== undefined;
}

/** Bucht die Zahlung; ein Konflikt auf `(provider, provider_payment_id)` rollt die Transaktion zurück. */
async function insertPayment(tx: Tx, values: typeof payments.$inferInsert): Promise<string> {
  const [row] = await tx
    .insert(payments)
    .values(values)
    .onConflictDoNothing({ target: [payments.provider, payments.providerPaymentId] })
    .returning({ id: payments.id });
  if (!row) throw new DuplicatePaymentError();
  return row.id;
}

/** Gebühren-Snapshot einer Fan-Zahlung: Plan des Creators zum Zahlungszeitpunkt, aktuelle Sätze. */
async function fanPaymentSplit(tx: Tx, creatorId: string, grossRappen: number, at: Date) {
  const plan = planOf(await isCreatorPremiumAt(creatorId, at, tx));
  const feeBps = feeBpsForPlan(plan, await getPlatformSettings(tx));
  return { plan, feeBps, ...splitPayment(grossRappen, feeBps) };
}

function premiumPaymentValues(
  event: CompletedEvent | RenewedEvent,
  premiumSubscriptionId: string,
  creatorId: string,
): typeof payments.$inferInsert {
  const split = splitPayment(event.amountRappen, PREMIUM_PLAN_FEE_BPS);
  return {
    kind: "premium_plan",
    premiumSubscriptionId,
    payerId: creatorId,
    creatorId: null,
    grossRappen: event.amountRappen,
    feeBps: PREMIUM_PLAN_FEE_BPS,
    platformFeeRappen: split.platformFeeRappen,
    creatorNetRappen: split.creatorNetRappen,
    creatorPlan: null,
    currency: event.currency,
    provider: event.provider,
    providerPaymentId: event.providerPaymentId,
    status: "succeeded",
    createdAt: event.occurredAt,
  };
}

// ─── Fan-Abo ──────────────────────────────────────────────────────────────────

async function lockSubscriptionByRef(tx: Tx, event: PaymentEvent) {
  const [sub] = await tx
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.provider, event.provider), eq(subscriptions.providerRef, event.providerSubscriptionRef)))
    .limit(1)
    .for("update");
  return sub;
}

async function activateSubscription(tx: Tx, event: CompletedEvent, now: Date): Promise<Result> {
  if (!UUID_PATTERN.test(event.referenceId)) return ignore("ungültige Abo-Referenz", event);
  const [sub] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, event.referenceId))
    .limit(1)
    .for("update");
  if (!sub) return ignore("Abo unbekannt", event);
  if (sub.fanId !== event.payerUserId) return ignore("Zahler passt nicht zum Abo", event);
  if (sub.provider !== event.provider) return ignore("Anbieter passt nicht zum Abo", event);
  if (await paymentExists(tx, event.provider, event.providerPaymentId)) return NOT_APPLIED;
  if (sub.status === "expired") return ignore("Abo ist bereits abgelaufen", event);
  if (isSubscriptionActive(sub, event.occurredAt)) {
    return ignore("Abo ist bereits aktiv – zweite Zahlung wird weder gebucht noch verlängert", event);
  }

  const split = await fanPaymentSplit(tx, sub.creatorId, event.amountRappen, event.occurredAt);
  await tx
    .update(subscriptions)
    .set({
      status: "active",
      priceRappen: event.amountRappen,
      currentPeriodStart: event.occurredAt,
      currentPeriodEnd: addBillingMonth(event.occurredAt),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      providerRef: event.providerSubscriptionRef,
    })
    .where(eq(subscriptions.id, sub.id));
  const paymentId = await insertPayment(tx, {
    kind: "fan_subscription",
    subscriptionId: sub.id,
    payerId: sub.fanId,
    creatorId: sub.creatorId,
    grossRappen: event.amountRappen,
    feeBps: split.feeBps,
    platformFeeRappen: split.platformFeeRappen,
    creatorNetRappen: split.creatorNetRappen,
    creatorPlan: split.plan,
    currency: event.currency,
    provider: event.provider,
    providerPaymentId: event.providerPaymentId,
    status: "succeeded",
    createdAt: event.occurredAt,
  });
  await writeAudit(
    {
      actorId: sub.fanId,
      action: "subscription.activated",
      targetType: "subscription",
      targetId: sub.id,
      metadata: {
        creatorId: sub.creatorId,
        paymentId,
        grossRappen: event.amountRappen,
        feeBps: split.feeBps,
        receivedAt: now.toISOString(),
      },
    },
    tx,
  );
  return APPLIED;
}

async function renewSubscription(tx: Tx, event: RenewedEvent): Promise<Result> {
  const sub = await lockSubscriptionByRef(tx, event);
  if (!sub) return ignore("Abo unbekannt", event);
  if (await paymentExists(tx, event.provider, event.providerPaymentId)) return NOT_APPLIED;
  if (sub.status !== "active" && sub.status !== "canceled") return ignore(`Abo ist ${sub.status}`, event);
  if (sub.status === "canceled") ignore("Verlängerung für ein gekündigtes Abo – wird trotzdem gebucht", event);

  const periodStart = sub.currentPeriodEnd ?? event.occurredAt;
  const split = await fanPaymentSplit(tx, sub.creatorId, event.amountRappen, event.occurredAt);
  await tx
    .update(subscriptions)
    .set({ currentPeriodStart: periodStart, currentPeriodEnd: addBillingMonth(periodStart) })
    .where(eq(subscriptions.id, sub.id));
  await insertPayment(tx, {
    kind: "fan_subscription",
    subscriptionId: sub.id,
    payerId: sub.fanId,
    creatorId: sub.creatorId,
    grossRappen: event.amountRappen,
    feeBps: split.feeBps,
    platformFeeRappen: split.platformFeeRappen,
    creatorNetRappen: split.creatorNetRappen,
    creatorPlan: split.plan,
    currency: event.currency,
    provider: event.provider,
    providerPaymentId: event.providerPaymentId,
    status: "succeeded",
    createdAt: event.occurredAt,
  });
  return APPLIED;
}

async function cancelSubscriptionByProvider(tx: Tx, event: CanceledEvent, now: Date): Promise<Result> {
  const sub = await lockSubscriptionByRef(tx, event);
  if (!sub) return ignore("Abo unbekannt", event);
  if (sub.status !== "active") return NOT_APPLIED; // schon gekündigt/abgelaufen → nichts zu tun
  await tx
    .update(subscriptions)
    .set({ status: "canceled", cancelAtPeriodEnd: true, canceledAt: event.occurredAt })
    .where(eq(subscriptions.id, sub.id));
  await writeAudit(
    {
      actorId: null,
      action: "subscription.canceled",
      targetType: "subscription",
      targetId: sub.id,
      metadata: { creatorId: sub.creatorId, fanId: sub.fanId, source: "provider", receivedAt: now.toISOString() },
    },
    tx,
  );
  return APPLIED;
}

// ─── Premium-Plan ─────────────────────────────────────────────────────────────

async function lockPremiumByRef(tx: Tx, event: PaymentEvent) {
  const [row] = await tx
    .select()
    .from(premiumSubscriptions)
    .where(
      and(
        eq(premiumSubscriptions.provider, event.provider),
        eq(premiumSubscriptions.providerRef, event.providerSubscriptionRef),
      ),
    )
    .limit(1)
    .for("update");
  return row;
}

async function activatePremium(tx: Tx, event: CompletedEvent, now: Date): Promise<Result> {
  if (event.referenceId !== event.payerUserId) return ignore("Premium muss vom Creator selbst bezahlt werden", event);
  if (!UUID_PATTERN.test(event.referenceId)) return ignore("ungültige Creator-Referenz", event);
  const [creator] = await tx
    .select({ id: users.id })
    .from(users)
    .innerJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
    .where(eq(users.id, event.referenceId))
    .limit(1);
  if (!creator) return ignore("Creator unbekannt", event);
  if (await paymentExists(tx, event.provider, event.providerPaymentId)) return NOT_APPLIED;

  const existing = await lockPremiumByRef(tx, event);
  if (existing && existing.creatorId !== creator.id) return ignore("Premium-Referenz gehört einem anderen Creator", event);
  if (existing && isPremiumActive(existing, event.occurredAt)) {
    return ignore("Premium läuft bereits – zweite Zahlung wird weder gebucht noch verlängert", event);
  }

  const settings = await getPlatformSettings(tx);
  const period = {
    status: "active" as const,
    priceRappen: settings.premiumPriceRappen,
    currency: event.currency,
    currentPeriodStart: event.occurredAt,
    currentPeriodEnd: addBillingMonth(event.occurredAt),
    cancelAtPeriodEnd: false,
    canceledAt: null,
  };
  let premiumId: string;
  if (existing) {
    // Genau eine Zeile pro Creator & Anbieter: in place reaktivieren.
    await tx.update(premiumSubscriptions).set(period).where(eq(premiumSubscriptions.id, existing.id));
    premiumId = existing.id;
  } else {
    const [inserted] = await tx
      .insert(premiumSubscriptions)
      .values({ ...period, creatorId: creator.id, provider: event.provider, providerRef: event.providerSubscriptionRef })
      .onConflictDoNothing({ target: [premiumSubscriptions.provider, premiumSubscriptions.providerRef] })
      .returning({ id: premiumSubscriptions.id });
    if (!inserted) {
      // Ein paralleles Event hat die Zeile gerade angelegt (bisher hier noch nichts geschrieben):
      // dieselbe Zahlung (Doppelklick) → still idempotent; eine andere (zweiter Tab) → nicht buchen.
      if (await paymentExists(tx, event.provider, event.providerPaymentId)) return NOT_APPLIED;
      return ignore("Premium wurde parallel aktiviert – zweite Zahlung wird weder gebucht noch verlängert", event);
    }
    premiumId = inserted.id;
  }

  const paymentId = await insertPayment(tx, premiumPaymentValues(event, premiumId, creator.id));
  await writeAudit(
    {
      actorId: creator.id,
      action: "premium.activated",
      targetType: "premium",
      targetId: premiumId,
      metadata: { paymentId, grossRappen: event.amountRappen, receivedAt: now.toISOString() },
    },
    tx,
  );
  return APPLIED;
}

async function renewPremium(tx: Tx, event: RenewedEvent): Promise<Result> {
  const row = await lockPremiumByRef(tx, event);
  if (!row) return ignore("Premium-Abo unbekannt", event);
  if (await paymentExists(tx, event.provider, event.providerPaymentId)) return NOT_APPLIED;
  if (row.status === "expired") return ignore("Premium-Abo ist abgelaufen", event);
  if (row.status === "canceled") ignore("Verlängerung für gekündigtes Premium – wird trotzdem gebucht", event);

  const periodStart = row.currentPeriodEnd;
  await tx
    .update(premiumSubscriptions)
    .set({ currentPeriodStart: periodStart, currentPeriodEnd: addBillingMonth(periodStart) })
    .where(eq(premiumSubscriptions.id, row.id));
  await insertPayment(tx, premiumPaymentValues(event, row.id, row.creatorId));
  return APPLIED;
}

async function cancelPremiumByProvider(tx: Tx, event: CanceledEvent, now: Date): Promise<Result> {
  const row = await lockPremiumByRef(tx, event);
  if (!row) return ignore("Premium-Abo unbekannt", event);
  if (row.status !== "active") return NOT_APPLIED;
  await tx
    .update(premiumSubscriptions)
    .set({ status: "canceled", cancelAtPeriodEnd: true, canceledAt: event.occurredAt })
    .where(eq(premiumSubscriptions.id, row.id));
  await writeAudit(
    {
      actorId: null,
      action: "premium.canceled",
      targetType: "premium",
      targetId: row.id,
      metadata: { creatorId: row.creatorId, source: "provider", receivedAt: now.toISOString() },
    },
    tx,
  );
  return APPLIED;
}

// ─── Einstiegspunkte ──────────────────────────────────────────────────────────

/**
 * Wendet ein (signaturgeprüftes) Zahlungs-Event an. `opts.now` = Empfangszeitpunkt (nur fürs Audit);
 * massgeblich für Perioden und Gebühren ist `event.occurredAt`.
 */
export async function handlePaymentEvent(event: PaymentEvent, opts: { now?: Date } = {}): Promise<Result> {
  const now = opts.now ?? new Date();
  try {
    return await getDb().transaction(async (tx) => {
      const premium = event.kind === "premium_plan";
      switch (event.type) {
        case "checkout.completed":
          return premium ? activatePremium(tx, event, now) : activateSubscription(tx, event, now);
        case "subscription.renewed":
          return premium ? renewPremium(tx, event) : renewSubscription(tx, event);
        case "subscription.canceled":
          return premium ? cancelPremiumByProvider(tx, event, now) : cancelSubscriptionByProvider(tx, event, now);
      }
    });
  } catch (error) {
    if (error instanceof DuplicatePaymentError) return NOT_APPLIED;
    throw error;
  }
}

/**
 * „Zahlung simulieren“ auf der Mock-Checkout-Seite: prüft die Session (Signatur, Ablauf, Zahler)
 * und verarbeitet das daraus abgeleitete `checkout.completed`. Ein Doppelklick ergibt dieselbe
 * Zahlungs-ID und damit genau eine Buchung.
 *
 * Ohne `opts.now` gilt die Uhr des Mock-Providers.
 */
export async function completeMockCheckout(
  viewer: Viewer,
  sessionId: string,
  opts: { now?: Date } = {},
): Promise<{ kind: CheckoutKind; creatorHandle: string | null }> {
  assertOnboarded(viewer);
  const provider = getMockProvider();
  const session = typeof sessionId === "string" ? provider.decodeSession(sessionId, opts.now) : null;
  if (!session) {
    throw new ValidationError("Diese Testzahlung ist ungültig oder abgelaufen. Bitte starte den Checkout neu.");
  }
  if (session.payerUserId !== viewer.id) {
    throw new ForbiddenError("Diese Testzahlung gehört zu einem anderen Konto.");
  }

  const event = provider.completedEventFor(sessionId, opts.now);
  await handlePaymentEvent(event, { now: event.occurredAt });

  let creatorHandle: string | null = null;
  if (session.kind === "fan_subscription" && UUID_PATTERN.test(session.referenceId)) {
    const [row] = await getDb()
      .select({ handle: users.handle })
      .from(subscriptions)
      .innerJoin(users, eq(users.id, subscriptions.creatorId))
      .where(eq(subscriptions.id, session.referenceId))
      .limit(1);
    creatorHandle = row?.handle ?? null;
  }
  return { kind: session.kind, creatorHandle };
}

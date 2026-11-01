import "server-only";

import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";

import { isSubscriptionActive } from "@/lib/domain/subscriptions";
import type { SubscriptionStatus, Viewer } from "@/lib/domain/types";
import { assertActive, assertAuthenticated, assertOnboarded } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { creatorProfiles, subscriptions, users, type Subscription } from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { getPaymentProvider } from "@/server/payments";
import { signMediaUrls } from "@/server/storage";

import { writeAudit } from "./audit";

/**
 * Fan-Abos (Fan → Creator): Checkout starten, kündigen, eigene Abos auflisten.
 * Aktiviert/verlängert werden Abos ausschliesslich über Zahlungs-Events (`payment-events.ts`).
 */

export type MySubscription = {
  id: string;
  creator: { userId: string; handle: string; displayName: string; avatarUrl: string | null };
  status: SubscriptionStatus;
  priceRappen: number;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** Zugriff besteht gerade (aktiv oder gekündigt, Periode läuft noch). */
  active: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_APP_URL = "http://localhost:3000";
const CREATOR_NOT_FOUND = "Diesen Creator gibt es nicht (mehr).";
const SUBSCRIPTION_NOT_FOUND = "Dieses Abo wurde nicht gefunden.";
const LIVE_STATUSES = ["pending", "active", "canceled"] as const;

/** Basis-URL für Rücksprünge aus dem Checkout (ohne abschliessenden Slash). */
export function appBaseUrl(override?: string): string {
  return (override ?? (process.env.APP_URL || DEFAULT_APP_URL)).replace(/\/+$/, "");
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * Startet den Checkout für ein Monats-Abo. Legt dafür eine `pending`-Zeile an (bzw. nutzt eine
 * vorhandene wieder) und friert den aktuellen Creator-Preis ein. Abgelaufene Zeilen des Paares
 * werden vorher auf `expired` gesetzt, damit sie ein neues Abo nicht blockieren.
 */
export async function startSubscriptionCheckout(
  viewer: Viewer,
  input: { creatorId: string },
  opts: { now?: Date; appUrl?: string } = {},
): Promise<{ redirectUrl: string }> {
  assertOnboarded(viewer);
  const now = opts.now ?? new Date();
  const { creatorId } = input;
  if (!isUuid(creatorId)) throw new NotFoundError(CREATOR_NOT_FOUND);
  if (creatorId === viewer.id) throw new ValidationError("Du kannst dein eigenes Profil nicht abonnieren.");

  const db = getDb();
  const [creator] = await db
    .select({
      handle: users.handle,
      status: users.status,
      deletedAt: users.deletedAt,
      verificationStatus: creatorProfiles.verificationStatus,
      priceRappen: creatorProfiles.monthlyPriceRappen,
    })
    .from(users)
    .innerJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
    .where(eq(users.id, creatorId))
    .limit(1);
  if (
    !creator ||
    creator.status !== "active" ||
    creator.deletedAt !== null ||
    creator.verificationStatus !== "approved" ||
    !creator.handle
  ) {
    throw new NotFoundError(CREATOR_NOT_FOUND);
  }
  const handle = creator.handle;

  const provider = getPaymentProvider();
  const pair = and(eq(subscriptions.fanId, viewer.id), eq(subscriptions.creatorId, creatorId));

  const subscription = await db.transaction(async (tx): Promise<Subscription> => {
    // Abgelaufene (auch nie verlängerte) Abos des Paares beerdigen.
    await tx
      .update(subscriptions)
      .set({ status: "expired" })
      .where(
        and(
          pair,
          inArray(subscriptions.status, ["active", "canceled"]),
          or(isNull(subscriptions.currentPeriodEnd), lte(subscriptions.currentPeriodEnd, now)),
        ),
      );

    const [live] = await tx
      .select()
      .from(subscriptions)
      .where(and(pair, inArray(subscriptions.status, [...LIVE_STATUSES])))
      .limit(1)
      .for("update");
    if (live && live.status !== "pending") {
      throw new ConflictError("Du hast dieses Profil bereits abonniert.");
    }
    if (live) {
      const [reused] = await tx
        .update(subscriptions)
        .set({ priceRappen: creator.priceRappen, provider: provider.name })
        .where(eq(subscriptions.id, live.id))
        .returning();
      return reused;
    }

    const [inserted] = await tx
      .insert(subscriptions)
      .values({
        fanId: viewer.id,
        creatorId,
        status: "pending",
        priceRappen: creator.priceRappen,
        provider: provider.name,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) return inserted;

    // Ein paralleler Aufruf hat die pending-Zeile gerade angelegt.
    const [concurrent] = await tx
      .select()
      .from(subscriptions)
      .where(and(pair, eq(subscriptions.status, "pending")))
      .limit(1);
    if (!concurrent) throw new ConflictError("Du hast dieses Profil bereits abonniert.");
    return concurrent;
  });

  const base = appBaseUrl(opts.appUrl);
  const profileUrl = `${base}/c/${encodeURIComponent(handle)}`;
  const session = await provider.createCheckout({
    kind: "fan_subscription",
    referenceId: subscription.id,
    payerUserId: viewer.id,
    amountRappen: subscription.priceRappen,
    currency: "CHF",
    description: `Monats-Abo bei @${handle}`,
    successUrl: `${profileUrl}?abo=ok`,
    cancelUrl: profileUrl,
  });
  return { redirectUrl: session.redirectUrl };
}

/**
 * Kündigt ein eigenes, laufendes Abo zum Periodenende (`status = canceled`, `cancel_at_period_end`).
 * Der Zugriff bleibt bis `current_period_end` bestehen. Erneutes Kündigen ist ein No-op.
 */
export async function cancelSubscription(
  viewer: Viewer,
  subscriptionId: string,
  opts: { now?: Date } = {},
): Promise<void> {
  assertActive(viewer);
  const now = opts.now ?? new Date();
  if (!isUuid(subscriptionId)) throw new NotFoundError(SUBSCRIPTION_NOT_FOUND);

  const db = getDb();
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.fanId, viewer.id)))
    .limit(1);
  if (!sub) throw new NotFoundError(SUBSCRIPTION_NOT_FOUND);
  if (sub.status === "canceled") return;
  if (sub.status !== "active" || !isSubscriptionActive(sub, now)) {
    throw new ConflictError("Dieses Abo ist nicht aktiv.");
  }

  // Zuerst beim Anbieter kündigen: schlägt das fehl, bleibt das Abo bei uns unverändert.
  if (sub.providerRef) await getPaymentProvider(sub.provider).cancelSubscription(sub.providerRef);

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(subscriptions)
      .set({ status: "canceled", cancelAtPeriodEnd: true, canceledAt: now })
      .where(and(eq(subscriptions.id, sub.id), eq(subscriptions.status, "active")))
      .returning({ id: subscriptions.id });
    if (updated.length === 0) return;
    await writeAudit(
      {
        actorId: viewer.id,
        action: "subscription.canceled",
        targetType: "subscription",
        targetId: sub.id,
        metadata: { creatorId: sub.creatorId, source: "fan" },
      },
      tx,
    );
  });
}

/**
 * Eigene Abos (ohne abgebrochene `pending`-Checkouts), pro Creator nur die relevanteste Zeile:
 * laufend vor abgelaufen, sonst die neueste. Gesperrte Creator werden ausgeblendet.
 */
export async function listMySubscriptions(viewer: Viewer, opts: { now?: Date } = {}): Promise<MySubscription[]> {
  assertAuthenticated(viewer);
  const now = opts.now ?? new Date();

  const rows = await getDb()
    .select({
      sub: subscriptions,
      handle: users.handle,
      displayName: users.displayName,
      avatarKey: users.avatarKey,
    })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.creatorId))
    .where(
      and(
        eq(subscriptions.fanId, viewer.id),
        inArray(subscriptions.status, ["active", "canceled", "expired"]),
        eq(users.status, "active"),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(desc(subscriptions.currentPeriodEnd), desc(subscriptions.createdAt));

  const byCreator = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const chosen = byCreator.get(row.sub.creatorId);
    if (!chosen || (chosen.sub.status === "expired" && row.sub.status !== "expired")) {
      byCreator.set(row.sub.creatorId, row);
    }
  }

  const avatarUrls = await signMediaUrls(
    [...byCreator.values()].map((r) => r.avatarKey).filter((key): key is string => key !== null),
  );

  const items = [...byCreator.values()].map(
    ({ sub, handle, displayName, avatarKey }): MySubscription => ({
      id: sub.id,
      creator: {
        userId: sub.creatorId,
        handle: handle ?? "",
        displayName: displayName ?? handle ?? "",
        avatarUrl: avatarKey ? (avatarUrls.get(avatarKey) ?? null) : null,
      },
      status: sub.status,
      priceRappen: sub.priceRappen,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      active: isSubscriptionActive(sub, now),
    }),
  );

  return items.sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      (b.currentPeriodEnd?.getTime() ?? 0) - (a.currentPeriodEnd?.getTime() ?? 0),
  );
}

import "server-only";

import { and, eq, or } from "drizzle-orm";

import type { Tx } from "@/server/db/client";
import { premiumSubscriptions, subscriptions } from "@/server/db/schema";
import { getPaymentProvider } from "@/server/payments";

export type ProviderSubscriptionRef = { provider: string; providerRef: string | null };

/**
 * Keine weiteren Abbuchungen für einen Nutzer (Sperre, Kontolöschung): laufende Abos als Fan UND als
 * Creator zum Periodenende kündigen, offene Checkouts verfallen lassen, Premium-Plan kündigen.
 * Erstattungen sind ein manueller Prozess. Läuft in der Transaktion des Aufrufers; die Provider-Refs
 * werden nach dem Commit mit `cancelAtProviders` gekündigt.
 */
export async function stopBillingForUser(
  tx: Tx,
  userId: string,
  now: Date,
): Promise<{ refs: ProviderSubscriptionRef[]; canceledSubscriptions: number; canceledPremium: boolean }> {
  const involvesUser = or(eq(subscriptions.fanId, userId), eq(subscriptions.creatorId, userId));
  const canceledSubs = await tx
    .update(subscriptions)
    .set({ status: "canceled", cancelAtPeriodEnd: true, canceledAt: now })
    .where(and(involvesUser, eq(subscriptions.status, "active")))
    .returning({ provider: subscriptions.provider, providerRef: subscriptions.providerRef });
  await tx
    .update(subscriptions)
    .set({ status: "expired" })
    .where(and(involvesUser, eq(subscriptions.status, "pending")));
  const canceledPremium = await tx
    .update(premiumSubscriptions)
    .set({ status: "canceled", cancelAtPeriodEnd: true, canceledAt: now })
    .where(and(eq(premiumSubscriptions.creatorId, userId), eq(premiumSubscriptions.status, "active")))
    .returning({ provider: premiumSubscriptions.provider, providerRef: premiumSubscriptions.providerRef });

  return {
    refs: [...canceledSubs, ...canceledPremium],
    canceledSubscriptions: canceledSubs.length,
    canceledPremium: canceledPremium.length > 0,
  };
}

/** Kündigt beim Provider (best effort – die DB ist die Quelle der Wahrheit). Erst nach dem Commit aufrufen. */
export async function cancelAtProviders(refs: ProviderSubscriptionRef[], context: string): Promise<void> {
  for (const { provider, providerRef } of refs) {
    if (!providerRef) continue;
    try {
      await getPaymentProvider(provider).cancelSubscription(providerRef);
    } catch (error) {
      console.error(`[${context}] Kündigung beim Provider fehlgeschlagen (${provider}:${providerRef})`, error);
    }
  }
}

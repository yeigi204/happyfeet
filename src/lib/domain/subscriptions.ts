import type { SubscriptionStatus } from "./types";

/** Zugriff besteht bei `active` oder `canceled`, solange die bezahlte Periode noch läuft. */
export function isSubscriptionActive(
  sub: { status: SubscriptionStatus; currentPeriodEnd: Date | null } | null | undefined,
  now: Date,
): boolean {
  if (!sub || (sub.status !== "active" && sub.status !== "canceled")) return false;
  return sub.currentPeriodEnd !== null && sub.currentPeriodEnd.getTime() > now.getTime();
}

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Gleicher Tag und gleiche Uhrzeit im Folgemonat (UTC); fehlt der Tag, wird aufs Monatsende geklemmt. */
export function addBillingMonth(date: Date): Date {
  const year = date.getUTCFullYear();
  const targetMonth = date.getUTCMonth() + 1;
  const day = Math.min(date.getUTCDate(), daysInUtcMonth(year, targetMonth));
  return new Date(
    Date.UTC(
      year,
      targetMonth,
      day,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

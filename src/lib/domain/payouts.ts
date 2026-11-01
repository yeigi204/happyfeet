import { PLAN_FEATURES } from "./plans";
import type { CreatorPlan, PayoutSchedule } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function payoutScheduleFor(plan: CreatorPlan): PayoutSchedule {
  return PLAN_FEATURES[plan].payoutSchedule;
}

/** Letzte Auszahlungsgrenze ≤ now: weekly = Montag 00:00 UTC, monthly = 1. des Monats 00:00 UTC. */
export function lastPayoutBoundary(schedule: PayoutSchedule, now: Date): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  if (schedule === "monthly") return new Date(Date.UTC(year, month, 1));
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(year, month, now.getUTCDate() - daysSinceMonday));
}

/** Nächste Auszahlungsgrenze > now. */
export function nextPayoutDate(schedule: PayoutSchedule, now: Date): Date {
  const last = lastPayoutBoundary(schedule, now);
  if (schedule === "weekly") return new Date(last.getTime() + 7 * DAY_MS);
  return new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1));
}

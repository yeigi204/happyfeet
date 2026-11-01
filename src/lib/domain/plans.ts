import type { CreatorPlan, PayoutSchedule } from "./types";

export type PlanFeatures = {
  badge: boolean;
  searchBoost: boolean;
  advancedStats: boolean;
  payoutSchedule: PayoutSchedule;
};

export const PLAN_FEATURES: Record<CreatorPlan, PlanFeatures> = {
  standard: { badge: false, searchBoost: false, advancedStats: false, payoutSchedule: "monthly" },
  premium: { badge: true, searchBoost: true, advancedStats: true, payoutSchedule: "weekly" },
};

/** Premium gilt, solange die bezahlte Periode läuft – auch nach einer Kündigung. */
export function isPremiumActive(
  sub: { status: "active" | "canceled" | "expired"; currentPeriodEnd: Date } | null | undefined,
  now: Date,
): boolean {
  if (!sub || sub.status === "expired") return false;
  return sub.currentPeriodEnd.getTime() > now.getTime();
}

export function planOf(isPremium: boolean): CreatorPlan {
  return isPremium ? "premium" : "standard";
}

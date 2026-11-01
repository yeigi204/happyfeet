import { describe, expect, it } from "vitest";
import { isPremiumActive, PLAN_FEATURES, planOf } from "./plans";

const now = new Date("2026-11-01T12:00:00Z");
const later = new Date("2026-11-15T00:00:00Z");
const earlier = new Date("2026-10-15T00:00:00Z");

describe("PLAN_FEATURES", () => {
  it("gives standard creators no extras and a monthly payout", () => {
    expect(PLAN_FEATURES.standard).toEqual({
      badge: false,
      searchBoost: false,
      advancedStats: false,
      payoutSchedule: "monthly",
    });
  });

  it("gives premium creators badge, search boost, advanced stats and weekly payouts", () => {
    expect(PLAN_FEATURES.premium).toEqual({
      badge: true,
      searchBoost: true,
      advancedStats: true,
      payoutSchedule: "weekly",
    });
  });
});

describe("planOf", () => {
  it("maps the premium flag to a plan", () => {
    expect(planOf(true)).toBe("premium");
    expect(planOf(false)).toBe("standard");
  });
});

describe("isPremiumActive", () => {
  it("is false without a premium subscription", () => {
    expect(isPremiumActive(null, now)).toBe(false);
    expect(isPremiumActive(undefined, now)).toBe(false);
  });

  it("is true for an active subscription within the period", () => {
    expect(isPremiumActive({ status: "active", currentPeriodEnd: later }, now)).toBe(true);
  });

  it("stays true for a canceled subscription until the period ends", () => {
    expect(isPremiumActive({ status: "canceled", currentPeriodEnd: later }, now)).toBe(true);
  });

  it("is false once the period has ended, even if still marked active", () => {
    expect(isPremiumActive({ status: "active", currentPeriodEnd: earlier }, now)).toBe(false);
    expect(isPremiumActive({ status: "canceled", currentPeriodEnd: earlier }, now)).toBe(false);
  });

  it("is false exactly at the end of the period", () => {
    expect(isPremiumActive({ status: "active", currentPeriodEnd: now }, now)).toBe(false);
    expect(isPremiumActive({ status: "canceled", currentPeriodEnd: now }, now)).toBe(false);
  });

  it("is false for an expired subscription even with a future period end", () => {
    expect(isPremiumActive({ status: "expired", currentPeriodEnd: later }, now)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { SubscriptionStatus } from "./types";
import { addBillingMonth, isSubscriptionActive } from "./subscriptions";

const now = new Date("2026-11-01T12:00:00Z");
const later = new Date("2026-11-20T12:00:00Z");
const earlier = new Date("2026-10-20T12:00:00Z");

describe("isSubscriptionActive", () => {
  it("is false without a subscription", () => {
    expect(isSubscriptionActive(null, now)).toBe(false);
    expect(isSubscriptionActive(undefined, now)).toBe(false);
  });

  it.each<[SubscriptionStatus, Date | null, boolean]>([
    ["active", later, true],
    ["canceled", later, true],
    ["active", earlier, false],
    ["canceled", earlier, false],
    ["active", now, false],
    ["pending", later, false],
    ["expired", later, false],
    ["active", null, false],
    ["pending", null, false],
  ])("status %s with period end %s → %s", (status, currentPeriodEnd, expected) => {
    expect(isSubscriptionActive({ status, currentPeriodEnd }, now)).toBe(expected);
  });
});

describe("addBillingMonth", () => {
  it.each([
    ["2026-01-15T10:00:00.000Z", "2026-02-15T10:00:00.000Z"],
    ["2026-01-31T10:00:00.000Z", "2026-02-28T10:00:00.000Z"],
    ["2028-01-31T10:00:00.000Z", "2028-02-29T10:00:00.000Z"],
    ["2026-03-31T23:59:59.999Z", "2026-04-30T23:59:59.999Z"],
    ["2026-12-15T08:30:00.000Z", "2027-01-15T08:30:00.000Z"],
    ["2026-12-31T00:00:00.000Z", "2027-01-31T00:00:00.000Z"],
    ["2026-02-28T10:00:00.000Z", "2026-03-28T10:00:00.000Z"],
  ])("%s → %s", (input, expected) => {
    expect(addBillingMonth(new Date(input)).toISOString()).toBe(expected);
  });

  it("does not mutate its input", () => {
    const input = new Date("2026-01-31T10:00:00Z");
    addBillingMonth(input);
    expect(input.toISOString()).toBe("2026-01-31T10:00:00.000Z");
  });
});

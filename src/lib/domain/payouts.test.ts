import { describe, expect, it } from "vitest";
import { lastPayoutBoundary, nextPayoutDate, payoutScheduleFor } from "./payouts";

const iso = (d: Date) => d.toISOString();

describe("payoutScheduleFor", () => {
  it("pays premium creators weekly and standard creators monthly", () => {
    expect(payoutScheduleFor("premium")).toBe("weekly");
    expect(payoutScheduleFor("standard")).toBe("monthly");
  });
});

describe("weekly payouts", () => {
  it.each([
    // Wednesday
    ["2026-11-04T10:00:00Z", "2026-11-02T00:00:00.000Z", "2026-11-09T00:00:00.000Z"],
    // Monday exactly at the boundary
    ["2026-11-02T00:00:00Z", "2026-11-02T00:00:00.000Z", "2026-11-09T00:00:00.000Z"],
    // Sunday late evening belongs to the previous week
    ["2026-11-01T23:59:59Z", "2026-10-26T00:00:00.000Z", "2026-11-02T00:00:00.000Z"],
    // across a year boundary (2027-01-01 is a Friday)
    ["2027-01-01T12:00:00Z", "2026-12-28T00:00:00.000Z", "2027-01-04T00:00:00.000Z"],
  ])("now %s → last %s, next %s", (now, last, next) => {
    expect(iso(lastPayoutBoundary("weekly", new Date(now)))).toBe(last);
    expect(iso(nextPayoutDate("weekly", new Date(now)))).toBe(next);
  });
});

describe("monthly payouts", () => {
  it.each([
    ["2026-11-15T10:00:00Z", "2026-11-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z"],
    ["2026-11-01T00:00:00Z", "2026-11-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z"],
    ["2026-12-31T23:59:59Z", "2026-12-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"],
  ])("now %s → last %s, next %s", (now, last, next) => {
    expect(iso(lastPayoutBoundary("monthly", new Date(now)))).toBe(last);
    expect(iso(nextPayoutDate("monthly", new Date(now)))).toBe(next);
  });
});

describe("payout boundaries", () => {
  it("always satisfy last ≤ now < next", () => {
    const start = Date.parse("2026-01-01T00:00:00Z");
    for (let i = 0; i < 400; i++) {
      const now = new Date(start + i * 22 * 60 * 60 * 1000 + i * 7919);
      for (const schedule of ["weekly", "monthly"] as const) {
        const last = lastPayoutBoundary(schedule, now);
        const next = nextPayoutDate(schedule, now);
        expect(last.getTime()).toBeLessThanOrEqual(now.getTime());
        expect(next.getTime()).toBeGreaterThan(now.getTime());
      }
    }
  });
});

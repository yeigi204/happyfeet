import { describe, expect, it } from "vitest";
import { feeBpsForPlan, splitPayment } from "./fees";

const settings = { standardFeeBps: 1500, premiumFeeBps: 500 };

describe("feeBpsForPlan", () => {
  it("uses the standard fee for standard creators", () => {
    expect(feeBpsForPlan("standard", settings)).toBe(1500);
  });

  it("uses the premium fee for premium creators", () => {
    expect(feeBpsForPlan("premium", settings)).toBe(500);
  });

  it("reads the fee from the given settings, not from defaults", () => {
    expect(feeBpsForPlan("standard", { standardFeeBps: 2000, premiumFeeBps: 700 })).toBe(2000);
    expect(feeBpsForPlan("premium", { standardFeeBps: 2000, premiumFeeBps: 700 })).toBe(700);
  });
});

describe("splitPayment", () => {
  it("rounds a half-rappen platform fee up (standard 15 %)", () => {
    expect(splitPayment(990, 1500)).toEqual({ platformFeeRappen: 149, creatorNetRappen: 841 });
  });

  it("rounds a half-rappen platform fee up (premium 5 %)", () => {
    expect(splitPayment(990, 500)).toEqual({ platformFeeRappen: 50, creatorNetRappen: 940 });
  });

  it("gives everything to the platform at 10000 bps (premium plan payment)", () => {
    expect(splitPayment(1000, 10000)).toEqual({ platformFeeRappen: 1000, creatorNetRappen: 0 });
  });

  it("gives everything to the creator at 0 bps", () => {
    expect(splitPayment(1000, 0)).toEqual({ platformFeeRappen: 0, creatorNetRappen: 1000 });
  });

  it("handles a zero amount", () => {
    expect(splitPayment(0, 1500)).toEqual({ platformFeeRappen: 0, creatorNetRappen: 0 });
  });

  it("rounds a fee below half a rappen down", () => {
    // 1234 * 0.15 = 185.1
    expect(splitPayment(1234, 1500)).toEqual({ platformFeeRappen: 185, creatorNetRappen: 1049 });
  });

  it("always splits the full gross amount without losing a rappen", () => {
    for (const gross of [1, 7, 99, 490, 995, 1900, 4990, 123_457]) {
      for (const bps of [0, 1, 500, 1500, 3333, 9999, 10000]) {
        const { platformFeeRappen, creatorNetRappen } = splitPayment(gross, bps);
        expect(platformFeeRappen + creatorNetRappen).toBe(gross);
        expect(Number.isInteger(platformFeeRappen)).toBe(true);
        expect(platformFeeRappen).toBeGreaterThanOrEqual(0);
        expect(creatorNetRappen).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it.each([
    ["a fractional amount", 10.5, 1500],
    ["a negative amount", -100, 1500],
    ["NaN as amount", Number.NaN, 1500],
    ["an infinite amount", Number.POSITIVE_INFINITY, 1500],
    ["negative bps", 1000, -1],
    ["bps above 10000", 1000, 10001],
    ["fractional bps", 1000, 1500.5],
    ["NaN as bps", 1000, Number.NaN],
  ])("throws a RangeError for %s", (_label, gross, bps) => {
    expect(() => splitPayment(gross, bps)).toThrow(RangeError);
  });
});

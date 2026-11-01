import { describe, expect, it } from "vitest";
import { validateMonthlyPrice } from "./pricing";

const settings = { minPriceRappen: 490, maxPriceRappen: 4990 };
const RANGE_REASON = "Der Preis muss zwischen CHF 4.90 und CHF 49.90 liegen.";
const STEP_REASON = "Der Preis muss in 10-Rappen-Schritten angegeben werden.";
const INVALID_REASON = "Bitte gib einen gültigen Preis ein.";

describe("validateMonthlyPrice", () => {
  it.each([490, 500, 1990, 4990])("accepts %i Rappen", (rappen) => {
    expect(validateMonthlyPrice(rappen, settings)).toEqual({ ok: true });
  });

  it("rejects prices that are not a multiple of 10 Rappen", () => {
    expect(validateMonthlyPrice(495, settings)).toEqual({ ok: false, reason: STEP_REASON });
  });

  it("rejects prices below the minimum", () => {
    expect(validateMonthlyPrice(480, settings)).toEqual({ ok: false, reason: RANGE_REASON });
  });

  it("rejects prices above the maximum", () => {
    expect(validateMonthlyPrice(5000, settings)).toEqual({ ok: false, reason: RANGE_REASON });
  });

  it("reports the range when both range and step are wrong", () => {
    expect(validateMonthlyPrice(485, settings)).toEqual({ ok: false, reason: RANGE_REASON });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 990.5, -990])("rejects the invalid value %s", (rappen) => {
    expect(validateMonthlyPrice(rappen, settings)).toEqual({ ok: false, reason: INVALID_REASON });
  });

  it("uses the configured range in the message", () => {
    expect(validateMonthlyPrice(100, { minPriceRappen: 1000, maxPriceRappen: 123_450 })).toEqual({
      ok: false,
      reason: "Der Preis muss zwischen CHF 10.00 und CHF 1’234.50 liegen.",
    });
  });
});

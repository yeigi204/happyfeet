import { describe, expect, it } from "vitest";
import { ageInYears, isAdult } from "./age";

describe("isAdult", () => {
  const now = new Date("2026-11-01T12:00:00Z");

  it("is true on the 18th birthday", () => {
    expect(isAdult("2008-11-01", now)).toBe(true);
  });

  it("is false one day before the 18th birthday", () => {
    expect(isAdult("2008-11-02", now)).toBe(false);
  });

  it("is true well past 18", () => {
    expect(isAdult("1990-05-20", now)).toBe(true);
  });

  it("lets people born on 29 February come of age on 1 March in non-leap years", () => {
    expect(isAdult("2008-02-29", new Date("2026-02-28T12:00:00Z"))).toBe(false);
    expect(isAdult("2008-02-29", new Date("2026-03-01T12:00:00Z"))).toBe(true);
  });

  it("uses the calendar date in Europe/Zurich, not UTC", () => {
    // 2026-10-31T23:30Z is already 2026-11-01 00:30 in Zurich (CET, UTC+1)
    expect(isAdult("2008-11-01", new Date("2026-10-31T23:30:00Z"))).toBe(true);
    // 2026-07-31T22:30Z is already 2026-08-01 00:30 in Zurich (CEST, UTC+2)
    expect(isAdult("2008-08-01", new Date("2026-07-31T22:30:00Z"))).toBe(true);
    // ...but 2026-07-31T21:30Z is still 2026-07-31 23:30 in Zurich
    expect(isAdult("2008-08-01", new Date("2026-07-31T21:30:00Z"))).toBe(false);
  });

  it("is false for birth dates in the future", () => {
    expect(isAdult("2030-01-01", now)).toBe(false);
  });

  it.each(["", "2008-1-1", "01.11.2008", "2008-13-01", "2008-02-30", "2007-02-29", "abcd-ef-gh"])(
    "fails closed for the invalid birth date %j",
    (birthDate) => {
      expect(isAdult(birthDate, now)).toBe(false);
    },
  );
});

describe("ageInYears", () => {
  const now = new Date("2026-11-01T12:00:00Z");

  it.each([
    ["2008-11-01", 18],
    ["2008-11-02", 17],
    ["2008-10-31", 18],
    ["1990-12-24", 35],
    ["2026-11-01", 0],
  ])("born %s → %i", (birthDate, expected) => {
    expect(ageInYears(birthDate, now)).toBe(expected);
  });

  it("counts a 29 February birthday on 29 February in leap years", () => {
    expect(ageInYears("2004-02-29", new Date("2028-02-28T12:00:00Z"))).toBe(23);
    expect(ageInYears("2004-02-29", new Date("2028-02-29T12:00:00Z"))).toBe(24);
  });

  it.each(["2008-02-30", "nope", "2008-00-10"])("throws a RangeError for %j", (birthDate) => {
    expect(() => ageInYears(birthDate, now)).toThrow(RangeError);
  });
});

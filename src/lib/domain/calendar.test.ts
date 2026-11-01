import { describe, expect, it } from "vitest";

import { zurichMonthBounds } from "./calendar";

const d = (iso: string) => new Date(iso);

describe("zurichMonthBounds", () => {
  it("Winterzeit: Dezember beginnt am 30.11. um 23:00 UTC", () => {
    expect(zurichMonthBounds(d("2026-11-30T23:45:00Z"))).toEqual({
      start: d("2026-11-30T23:00:00Z"),
      end: d("2026-12-31T23:00:00Z"),
    });
  });

  it("kurz vor Mitternacht Zürcher Zeit gilt noch der alte Monat", () => {
    expect(zurichMonthBounds(d("2026-11-30T22:59:59Z"))).toEqual({
      start: d("2026-10-31T23:00:00Z"),
      end: d("2026-11-30T23:00:00Z"),
    });
  });

  it("Sommerzeit: Juli beginnt am 30.6. um 22:00 UTC", () => {
    expect(zurichMonthBounds(d("2027-07-15T12:00:00Z"))).toEqual({
      start: d("2027-06-30T22:00:00Z"),
      end: d("2027-07-31T22:00:00Z"),
    });
  });

  it("Monate mit Zeitumstellung (März, Oktober) und Jahreswechsel", () => {
    expect(zurichMonthBounds(d("2027-03-31T12:00:00Z"))).toEqual({
      start: d("2027-02-28T23:00:00Z"),
      end: d("2027-03-31T22:00:00Z"),
    });
    expect(zurichMonthBounds(d("2026-10-31T12:00:00Z"))).toEqual({
      start: d("2026-09-30T22:00:00Z"),
      end: d("2026-10-31T23:00:00Z"),
    });
    expect(zurichMonthBounds(d("2026-12-31T23:30:00Z"))).toEqual({
      start: d("2026-12-31T23:00:00Z"),
      end: d("2027-01-31T23:00:00Z"),
    });
  });
});

import { describe, expect, it } from "vitest";

import { auditCursorParams, nextAuditCursor, parseAuditCursor } from "./audit-cursor";
import { hundredthsToInput, parseHundredths, parseWholeNumber } from "./decimal-input";
import { directionOf, formatSignedNumber, formatSignedPercentPoints } from "./format-delta";
import { urgencyFor } from "./urgency";

const NBSP = " ";

describe("urgencyFor", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

  it("ist null ohne wartende Einträge", () => {
    expect(urgencyFor(null, now)).toBeNull();
    expect(urgencyFor(new Date("kaputt"), now)).toBeNull();
  });

  it("stuft nach 24 h und 72 h hoch (Grenzen inklusive)", () => {
    expect(urgencyFor(hoursAgo(23.9), now)).toBe("ok");
    expect(urgencyFor(hoursAgo(24), now)).toBe("due");
    expect(urgencyFor(hoursAgo(71.9), now)).toBe("due");
    expect(urgencyFor(hoursAgo(72), now)).toBe("overdue");
  });
});

describe("parseHundredths", () => {
  it("liest Franken und Prozent exakt (ohne Fliesskomma-Rundung)", () => {
    expect(parseHundredths("9.90")).toEqual({ ok: true, hundredths: 990 });
    expect(parseHundredths("9,9")).toEqual({ ok: true, hundredths: 990 });
    expect(parseHundredths(" 15 ")).toEqual({ ok: true, hundredths: 1500 });
    expect(parseHundredths("12.5")).toEqual({ ok: true, hundredths: 1250 });
    expect(parseHundredths("0.07")).toEqual({ ok: true, hundredths: 7 });
    expect(parseHundredths("1’234.50")).toEqual({ ok: true, hundredths: 123450 });
    expect(parseHundredths("1'234.50")).toEqual({ ok: true, hundredths: 123450 });
  });

  it("weist Unsinn und versteckte Rundung ab", () => {
    expect(parseHundredths("").ok).toBe(false);
    expect(parseHundredths("abc").ok).toBe(false);
    expect(parseHundredths("9.999")).toEqual({ ok: false, reason: "Höchstens zwei Nachkommastellen." });
    expect(parseHundredths("1e3").ok).toBe(false);
    expect(parseHundredths(undefined).ok).toBe(false);
  });

  it("parseWholeNumber akzeptiert nur ganze, nicht negative Zahlen", () => {
    expect(parseWholeNumber("5")).toEqual({ ok: true, value: 5 });
    expect(parseWholeNumber("5.5").ok).toBe(false);
    expect(parseWholeNumber("-1").ok).toBe(false);
  });

  it("hundredthsToInput ist die Umkehrung", () => {
    expect(hundredthsToInput(990, "chf")).toBe("9.90");
    expect(hundredthsToInput(1500, "percent")).toBe("15");
    expect(hundredthsToInput(1250, "percent")).toBe("12.5");
    expect(hundredthsToInput(125, "percent")).toBe("1.25");
  });
});

describe("format-delta", () => {
  it("formatiert Prozentpunkte mit Vorzeichen", () => {
    expect(formatSignedPercentPoints(13.9)).toBe(`+13.9${NBSP}%`);
    expect(formatSignedPercentPoints(-3)).toBe(`-3.0${NBSP}%`);
    expect(formatSignedPercentPoints(0)).toBe(`0.0${NBSP}%`);
    expect(formatSignedPercentPoints(null)).toBeNull();
  });

  it("formatiert Zähler mit Vorzeichen", () => {
    expect(formatSignedNumber(704)).toBe("+704");
    expect(formatSignedNumber(-12)).toBe("-12");
    expect(formatSignedNumber(1234)).toBe("+1’234");
    expect(directionOf(0)).toBe("flat");
    expect(directionOf(-0.1)).toBe("down");
  });
});

describe("audit-cursor", () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

  it("zeigt eine Millisekunde hinter den letzten Eintrag und merkt sich IDs derselben Millisekunde", () => {
    const t = new Date("2026-10-30T00:24:41.581Z");
    const cursor = nextAuditCursor([
      { id: id(1), createdAt: new Date("2026-10-31T10:00:00Z") },
      { id: id(2), createdAt: t },
      { id: id(3), createdAt: new Date(t) },
    ]);
    expect(cursor).toEqual({ before: new Date("2026-10-30T00:24:41.582Z"), skip: [id(2), id(3)] });
    expect(auditCursorParams(cursor!)).toEqual({ before: "2026-10-30T00:24:41.582Z", skip: `${id(2)},${id(3)}` });
  });

  it("parst nur gültige Werte", () => {
    expect(parseAuditCursor("2026-10-30T00:24:41.582Z", `${id(2)},nope`)).toEqual({
      before: new Date("2026-10-30T00:24:41.582Z"),
      skip: [id(2)],
    });
    expect(parseAuditCursor("gestern", undefined)).toBeNull();
    expect(parseAuditCursor(["2026-10-30"], undefined)).toBeNull();
    expect(nextAuditCursor([])).toBeNull();
  });
});

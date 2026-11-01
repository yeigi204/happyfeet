import { describe, expect, it } from "vitest";
import { HANDLE_PATTERN, normalizeHandle, RESERVED_HANDLES, validateHandle } from "./handles";

describe("HANDLE_PATTERN", () => {
  it.each(["abc", "foot_lover", "a1_b2_c3", "x".repeat(24)])("matches %j", (handle) => {
    expect(HANDLE_PATTERN.test(handle)).toBe(true);
  });

  it.each(["ab", "x".repeat(25), "Foot", "foot-lover", "foot.lover", "füsse", "foot lover", "@foot"])(
    "does not match %j",
    (handle) => {
      expect(HANDLE_PATTERN.test(handle)).toBe(false);
    },
  );
});

describe("RESERVED_HANDLES", () => {
  it.each([
    "admin",
    "studio",
    "explore",
    "feed",
    "api",
    "c",
    "sign-in",
    "sign-up",
    "onboarding",
    "support",
    "happyfeet",
    "banned",
  ])("contains %j", (handle) => {
    expect(RESERVED_HANDLES.has(handle)).toBe(true);
  });

  it("only contains lowercase entries", () => {
    for (const handle of RESERVED_HANDLES) expect(handle).toBe(handle.toLowerCase());
  });
});

describe("normalizeHandle", () => {
  it.each([
    ["foot_lover", "foot_lover"],
    ["  Foot_Lover  ", "foot_lover"],
    ["@FootLover", "footlover"],
    ["  @footlover ", "footlover"],
    ["", ""],
  ])("%j → %j", (input, expected) => {
    expect(normalizeHandle(input)).toBe(expected);
  });

  it("only removes a single leading @", () => {
    expect(normalizeHandle("@@foot")).toBe("@foot");
  });
});

describe("validateHandle", () => {
  it.each(["abc", "foot_lover", "happy_feet_ch", "x".repeat(24)])("accepts %j", (handle) => {
    expect(validateHandle(handle)).toEqual({ ok: true });
  });

  it.each([
    ["", "Mindestens 3 Zeichen."],
    ["ab", "Mindestens 3 Zeichen."],
    ["x".repeat(25), "Höchstens 24 Zeichen."],
    ["Foot", "Nur Kleinbuchstaben (a–z), Ziffern und _ erlaubt."],
    ["foot-lover", "Nur Kleinbuchstaben (a–z), Ziffern und _ erlaubt."],
    ["füsse", "Nur Kleinbuchstaben (a–z), Ziffern und _ erlaubt."],
    ["admin", "Dieser Name ist reserviert."],
    ["happyfeet", "Dieser Name ist reserviert."],
  ])("rejects %j", (handle, reason) => {
    expect(validateHandle(handle)).toEqual({ ok: false, reason });
  });
});

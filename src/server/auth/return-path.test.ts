import { describe, expect, it } from "vitest";

import { returnPathFromUrl, safeReturnPath, withReturnPath } from "./return-path";

describe("safeReturnPath", () => {
  it.each(["/studio/become-creator", "/checkout/mock/abc.def?x=1", "/c/zehenspiel", "/feed"])("akzeptiert %j", (path) => {
    expect(safeReturnPath(path)).toBe(path);
  });

  it.each([
    null,
    undefined,
    "",
    "studio",
    "//evil.example",
    "/\\evil.example",
    "https://evil.example/x",
    "/\tevil",
    "/sign-in",
    "/sign-in/factor-one",
    "/sign-up?x=1",
    "/onboarding",
    "/",
    `/${"a".repeat(2100)}`,
  ])("lehnt %j ab", (path) => {
    expect(safeReturnPath(path)).toBeNull();
  });
});

describe("withReturnPath", () => {
  it("hängt den Rücksprung als redirect_url an", () => {
    expect(withReturnPath("/sign-in", "/studio/posts/new")).toBe("/sign-in?redirect_url=%2Fstudio%2Fposts%2Fnew");
  });

  it("ohne (gültigen) Rücksprung bleibt das Ziel unverändert", () => {
    expect(withReturnPath("/sign-in", null)).toBe("/sign-in");
    expect(withReturnPath("/sign-in", "//evil.example")).toBe("/sign-in");
  });
});

describe("returnPathFromUrl", () => {
  it("liefert Pfad und Query ohne Next-interne Parameter", () => {
    expect(returnPathFromUrl(new URL("http://localhost:3000/checkout/mock/s1?_rsc=abc&x=1"))).toBe("/checkout/mock/s1?x=1");
    expect(returnPathFromUrl(new URL("http://localhost:3000/feed?_rsc=1"))).toBe("/feed");
  });
});

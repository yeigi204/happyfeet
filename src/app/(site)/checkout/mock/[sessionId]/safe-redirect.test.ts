import { describe, expect, it } from "vitest";

import { creatorHandleFromPath, toSafeLocalPath } from "./safe-redirect";

const APP = "http://localhost:3000";

describe("toSafeLocalPath", () => {
  it("accepts relative app paths unchanged", () => {
    expect(toSafeLocalPath("/c/zehenspiel?abo=ok", APP)).toBe("/c/zehenspiel?abo=ok");
    expect(toSafeLocalPath("/studio/premium?ok=1#oben", APP)).toBe("/studio/premium?ok=1#oben");
  });

  it("turns same-origin absolute URLs into local paths", () => {
    expect(toSafeLocalPath("http://localhost:3000/c/zehenspiel?abo=ok", APP)).toBe("/c/zehenspiel?abo=ok");
    expect(toSafeLocalPath("http://localhost:3000", APP)).toBe("/");
  });

  it("rejects other origins, including look-alikes and other ports or schemes", () => {
    expect(toSafeLocalPath("https://evil.example/c/x", APP)).toBeNull();
    expect(toSafeLocalPath("http://localhost:3000.evil.example/", APP)).toBeNull();
    expect(toSafeLocalPath("http://localhost:4000/c/x", APP)).toBeNull();
    expect(toSafeLocalPath("https://localhost:3000/c/x", APP)).toBeNull();
  });

  it("rejects protocol-relative and backslash tricks", () => {
    expect(toSafeLocalPath("//evil.example/x", APP)).toBeNull();
    expect(toSafeLocalPath("/\\evil.example", APP)).toBeNull();
    expect(toSafeLocalPath("http://localhost:3000//evil.example", APP)).toBeNull();
    expect(toSafeLocalPath("/\t/evil.example", APP)).toBeNull();
    expect(toSafeLocalPath(" /c/x", APP)).toBeNull();
  });

  it("rejects non-http schemes and garbage", () => {
    expect(toSafeLocalPath("javascript:alert(1)", APP)).toBeNull();
    expect(toSafeLocalPath("data:text/html,hi", APP)).toBeNull();
    expect(toSafeLocalPath("", APP)).toBeNull();
    expect(toSafeLocalPath("/x", "not a url")).toBeNull();
    expect(toSafeLocalPath(`/${"a".repeat(2100)}`, APP)).toBeNull();
  });
});

describe("creatorHandleFromPath", () => {
  it("extracts the handle from profile paths", () => {
    expect(creatorHandleFromPath("/c/zehenspiel?abo=ok")).toBe("zehenspiel");
    expect(creatorHandleFromPath("/c/piedi_ticino")).toBe("piedi_ticino");
  });

  it("ignores everything else", () => {
    expect(creatorHandleFromPath("/studio/premium?ok=1")).toBeNull();
    expect(creatorHandleFromPath("/c/AB")).toBeNull();
    expect(creatorHandleFromPath("/c/zehenspiel.evil")).toBeNull();
    expect(creatorHandleFromPath(null)).toBeNull();
  });
});

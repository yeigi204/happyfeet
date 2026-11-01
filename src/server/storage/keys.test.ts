import { describe, expect, it } from "vitest";

import { isSafeMediaKey, mediaKeys } from "./keys";

const POST_ID = "6c1f2a9e-4b3d-4f5a-9c2e-1d7b8a0e3f41";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

describe("mediaKeys", () => {
  it("legt Original und Vorschau mit gemeinsamer Zufalls-ID im Post-Ordner ab", () => {
    const { originalKey, previewKey } = mediaKeys(POST_ID, 2);

    expect(originalKey).toMatch(new RegExp(`^posts/${POST_ID}/2-${UUID}-original\\.webp$`));
    const id = originalKey.slice(`posts/${POST_ID}/2-`.length, -"-original.webp".length);
    expect(previewKey).toBe(`posts/${POST_ID}/2-${id}-preview.webp`);
  });

  it("erzeugt bei jedem Aufruf eine neue Zufalls-ID (Keys nicht erratbar)", () => {
    const a = mediaKeys(POST_ID, 0);
    const b = mediaKeys(POST_ID, 0);
    expect(a.originalKey).not.toBe(b.originalKey);
    expect(a.previewKey).not.toBe(b.previewKey);
  });

  it("liefert Keys, die isSafeMediaKey akzeptiert", () => {
    const { originalKey, previewKey } = mediaKeys(POST_ID, 9);
    expect(isSafeMediaKey(originalKey)).toBe(true);
    expect(isSafeMediaKey(previewKey)).toBe(true);
  });

  it.each([-1, 1.5, Number.NaN])("lehnt ungültige Position %s ab", (position) => {
    expect(() => mediaKeys(POST_ID, position)).toThrow(RangeError);
  });

  it.each(["", "../x", "a/b", "a b"])("lehnt unsichere Post-ID %j ab", (postId) => {
    expect(() => mediaKeys(postId, 0)).toThrow(RangeError);
  });
});

describe("isSafeMediaKey", () => {
  it.each([
    "posts/abc/0-original.webp",
    `posts/${POST_ID}/3-x_y-preview.webp`,
    "avatars/user_1.webp",
    "a",
  ])("akzeptiert %j", (key) => {
    expect(isSafeMediaKey(key)).toBe(true);
  });

  it.each([
    "../etc/passwd",
    "posts/../../etc/passwd",
    "posts/..",
    "..",
    "posts/a..b/x.webp",
    "/etc/passwd",
    "posts//a.webp",
    "posts/a/",
    "posts/./a.webp",
    "./a.webp",
    "posts\\..\\a.webp",
    "posts/a b.webp",
    "posts/%2e%2e/a.webp",
    "posts/a.webp\u0000",
    "posts/ä.webp",
    "posts/a.webp?x=1",
    "",
    "a".repeat(513),
  ])("lehnt %j ab", (key) => {
    expect(isSafeMediaKey(key)).toBe(false);
  });

  it("lehnt Nicht-Strings ab", () => {
    expect(isSafeMediaKey(undefined as unknown as string)).toBe(false);
    expect(isSafeMediaKey(42 as unknown as string)).toBe(false);
  });
});

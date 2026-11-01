import { describe, expect, it } from "vitest";
import { POST_LIMITS } from "./posts";

describe("POST_LIMITS", () => {
  it("matches the product limits", () => {
    expect(POST_LIMITS).toEqual({
      minImages: 1,
      maxImages: 10,
      maxImageBytes: 10_485_760,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      maxCaptionLength: 2000,
    });
  });
});

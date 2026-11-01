import { describe, expect, it } from "vitest";
import { initialModerationStatus } from "./moderation";

describe("initialModerationStatus", () => {
  it.each([
    [0, 5, "pending"],
    [4, 5, "pending"],
    [5, 5, "approved"],
    [12, 5, "approved"],
    [0, 0, "approved"],
    [0, 1, "pending"],
    [1, 1, "approved"],
  ] as const)("%i approved posts with pre-moderation of %i → %s", (approved, threshold, expected) => {
    expect(initialModerationStatus(approved, threshold)).toBe(expected);
  });
});

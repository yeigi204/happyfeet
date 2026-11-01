import { describe, expect, it } from "vitest";

import { countLabel, premoderationCopy } from "./text";

describe("countLabel", () => {
  it("picks singular only for exactly one", () => {
    expect(countLabel(1, "Post", "Posts", String)).toBe("1 Post");
    expect(countLabel(0, "Post", "Posts", String)).toBe("0 Posts");
  });
});

describe("premoderationCopy", () => {
  const copy = { off: "Neue Posts gehen sofort online.", one: "Den ersten Post prüfen wir.", many: (n: string) => `Die ersten ${n} Posts prüfen wir.` };

  it("never renders '0 Posts' or '1 Posts'", () => {
    expect(premoderationCopy(0, copy)).toBe("Neue Posts gehen sofort online.");
    expect(premoderationCopy(1, copy)).toBe("Den ersten Post prüfen wir.");
    expect(premoderationCopy(5, copy)).toBe("Die ersten 5 Posts prüfen wir.");
    expect(premoderationCopy(50, copy, (n) => `#${n}`)).toBe("Die ersten #50 Posts prüfen wir.");
  });
});

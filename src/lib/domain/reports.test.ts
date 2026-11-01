import { describe, expect, it } from "vitest";
import type { ReportReason } from "./types";
import { REPORT_REASONS } from "./reports";

describe("REPORT_REASONS", () => {
  it("covers every report reason", () => {
    const all: ReportReason[] = ["not_own_content", "possible_minor", "non_consensual", "spam", "other"];
    expect(Object.keys(REPORT_REASONS).sort()).toEqual([...all].sort());
  });

  it("treats possible minors and non-consensual content as critical", () => {
    expect(REPORT_REASONS.possible_minor.severity).toBe("critical");
    expect(REPORT_REASONS.non_consensual.severity).toBe("critical");
  });

  it("treats stolen content as high severity", () => {
    expect(REPORT_REASONS.not_own_content.severity).toBe("high");
  });

  it("treats spam and other as normal severity", () => {
    expect(REPORT_REASONS.spam.severity).toBe("normal");
    expect(REPORT_REASONS.other.severity).toBe("normal");
  });

  it("has German labels without ß", () => {
    for (const { label } of Object.values(REPORT_REASONS)) {
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toContain("ß");
    }
  });
});

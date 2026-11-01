import { describe, expect, it } from "vitest";

import { assertProductionConfig, productionConfigProblems } from "./production-check";

const strong = "x".repeat(16) + "A9f!kL0pQ2rS7tUv";

describe("productionConfigProblems", () => {
  it("prüft ausserhalb von Produktion nichts", () => {
    expect(productionConfigProblems({ NODE_ENV: "development", DEV_IMPERSONATE_CLERK_ID: "seed_admin" })).toEqual([]);
  });

  it("verbietet Dev-Impersonation und lokalen Storage in Produktion", () => {
    const problems = productionConfigProblems({
      NODE_ENV: "production",
      DEV_IMPERSONATE_CLERK_ID: "seed_admin",
      STORAGE_DRIVER: "local",
    });
    expect(problems).toHaveLength(2);
  });

  it("erkennt Platzhalter- und zu kurze Secrets", () => {
    const problems = productionConfigProblems({
      NODE_ENV: "production",
      MEDIA_SIGNING_SECRET: "change-me-change-me-change-me-change-me",
      PAYMENT_WEBHOOK_SECRET: "kurz",
    });
    expect(problems).toHaveLength(2);
  });

  it("akzeptiert eine saubere Produktionskonfiguration", () => {
    expect(() =>
      assertProductionConfig({
        NODE_ENV: "production",
        STORAGE_DRIVER: "supabase",
        MEDIA_SIGNING_SECRET: strong,
        PAYMENT_WEBHOOK_SECRET: strong,
      }),
    ).not.toThrow();
  });
});

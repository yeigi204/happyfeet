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
      PAYMENT_PROVIDER: "segpay",
      DEV_IMPERSONATE_CLERK_ID: "seed_admin",
      STORAGE_DRIVER: "local",
    });
    expect(problems).toHaveLength(2);
  });

  it("erkennt Platzhalter- und zu kurze Secrets", () => {
    const problems = productionConfigProblems({
      NODE_ENV: "production",
      PAYMENT_PROVIDER: "segpay",
      MEDIA_SIGNING_SECRET: "change-me-change-me-change-me-change-me",
      PAYMENT_WEBHOOK_SECRET: "kurz",
    });
    expect(problems).toHaveLength(2);
  });

  it("verbietet den Mock-Zahlungsanbieter in Produktion – auch als stillen Standard ohne PAYMENT_PROVIDER", () => {
    const base = { NODE_ENV: "production", STORAGE_DRIVER: "supabase" };
    expect(productionConfigProblems(base)).toEqual([expect.stringContaining("PAYMENT_PROVIDER")]);
    expect(productionConfigProblems({ ...base, PAYMENT_PROVIDER: "mock" })).toEqual([
      expect.stringContaining("PAYMENT_PROVIDER"),
    ]);
    expect(productionConfigProblems({ ...base, PAYMENT_PROVIDER: " mock " })).toHaveLength(1);
  });

  it("erlaubt Mock-Zahlungen in Produktion nur mit ausdrücklichem Opt-in (z. B. Staging)", () => {
    const base = { NODE_ENV: "production", STORAGE_DRIVER: "supabase" };
    expect(productionConfigProblems({ ...base, ALLOW_MOCK_PAYMENTS_IN_PRODUCTION: "true" })).toEqual([]);
    expect(productionConfigProblems({ ...base, ALLOW_MOCK_PAYMENTS_IN_PRODUCTION: "1" })).toHaveLength(1);
  });

  it("akzeptiert eine saubere Produktionskonfiguration", () => {
    expect(() =>
      assertProductionConfig({
        NODE_ENV: "production",
        STORAGE_DRIVER: "supabase",
        PAYMENT_PROVIDER: "segpay",
        MEDIA_SIGNING_SECRET: strong,
        PAYMENT_WEBHOOK_SECRET: strong,
      }),
    ).not.toThrow();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { getImpersonatedClerkId, isDevImpersonation } from "./dev-impersonation";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getImpersonatedClerkId", () => {
  it("liefert die ID in der Entwicklung", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_IMPERSONATE_CLERK_ID", "seed_admin");
    expect(getImpersonatedClerkId()).toBe("seed_admin");
  });

  it("liefert die ID auch in Tests (alles ausser Produktion)", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEV_IMPERSONATE_CLERK_ID", "seed_fan_1");
    expect(getImpersonatedClerkId()).toBe("seed_fan_1");
  });

  it("ignoriert Leerraum rund um die ID", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_IMPERSONATE_CLERK_ID", "  seed_creator_1 \n");
    expect(getImpersonatedClerkId()).toBe("seed_creator_1");
  });

  it("liefert null, wenn nichts oder nur Leerraum gesetzt ist", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_IMPERSONATE_CLERK_ID", "");
    expect(getImpersonatedClerkId()).toBeNull();
    vi.stubEnv("DEV_IMPERSONATE_CLERK_ID", "   ");
    expect(getImpersonatedClerkId()).toBeNull();
    vi.stubEnv("DEV_IMPERSONATE_CLERK_ID", undefined);
    expect(getImpersonatedClerkId()).toBeNull();
  });

  it("wirft in Produktion, wenn die Variable gesetzt ist", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_IMPERSONATE_CLERK_ID", "seed_admin");
    expect(() => getImpersonatedClerkId()).toThrow(/DEV_IMPERSONATE_CLERK_ID/);
  });

  it("liefert null in Produktion ohne gesetzte Variable", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_IMPERSONATE_CLERK_ID", undefined);
    expect(getImpersonatedClerkId()).toBeNull();
  });
});

describe("isDevImpersonation", () => {
  it("ist true, wenn in der Entwicklung eine ID gesetzt ist", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_IMPERSONATE_CLERK_ID", "seed_admin");
    expect(isDevImpersonation()).toBe(true);
  });

  it("ist false ohne ID", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_IMPERSONATE_CLERK_ID", "");
    expect(isDevImpersonation()).toBe(false);
  });

  it("wirft in Produktion mit gesetzter Variable statt still zu impersonieren", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_IMPERSONATE_CLERK_ID", "seed_admin");
    expect(() => isDevImpersonation()).toThrow();
  });
});

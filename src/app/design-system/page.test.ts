import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TOKENS, type TokenName } from "@/lib/design-tokens";

vi.mock("next/navigation", () => ({
  usePathname: () => "/design-system",
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));
vi.mock("@/server/theme", () => ({ getThemePreference: async () => "system" }));

const { default: DesignSystemPage } = await import("./page");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/design-system", () => {
  it("is not reachable in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(DesignSystemPage()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("zeigt jedes Token mit Hell- und Dunkel-Wert, alle Bausteine und den Umschalter", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const markup = renderToStaticMarkup(await DesignSystemPage());
    for (const name of Object.keys(TOKENS.light) as TokenName[]) {
      expect(markup, name).toContain(name);
      expect(markup, `${name} hell`).toContain(TOKENS.light[name]);
      expect(markup, `${name} dunkel`).toContain(TOKENS.dark[name]);
    }
    for (const section of ["Farben", "Schrift", "Formen", "Bausteine", "Diagramme"]) expect(markup).toContain(section);
    expect(markup).toContain('aria-label="Darstellung"');
    expect(markup).toContain('aria-roledescription="Diagramm"');
    expect(markup).not.toContain("theme-admin");
    expect(markup).not.toContain("ß");
  });
});

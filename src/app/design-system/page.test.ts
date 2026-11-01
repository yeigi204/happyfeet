import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/design-system",
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));

const { default: DesignSystemPage } = await import("./page");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/design-system", () => {
  it("is not reachable in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => DesignSystemPage()).toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("shows every primitive and chart in the light world and inside the admin shell", () => {
    vi.stubEnv("NODE_ENV", "development");
    const markup = renderToStaticMarkup(h(DesignSystemPage));
    for (const section of ["Farben", "Typografie", "Bedienelemente", "Auszeichnung", "Kennzahlen", "Diagramme", "Tabellen", "Leere Zustände", "Admin"]) {
      expect(markup).toContain(section);
    }
    expect(markup).toContain("theme-admin");
    expect(markup).toContain('aria-roledescription="Diagramm"');
    expect(markup).toContain("data-segment");
    expect(markup).toContain("Warteschlangen");
    expect(markup).not.toContain("ß");
  });
});

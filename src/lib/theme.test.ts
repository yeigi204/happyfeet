import { describe, expect, it } from "vitest";

import { THEME_COOKIE, parseThemePreference, themeAttribute, themeCookieValue } from "./theme";

describe("parseThemePreference", () => {
  it("erkennt Hell, Dunkel und fehlende Wahl", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference(undefined)).toBe("system");
  });

  it("parseThemePreference rejects unknown values", () => {
    for (const value of ["hacker", "", "DARK ", "system", "x".repeat(5000)]) {
      expect(parseThemePreference(value)).toBe("system");
    }
  });
});

describe("themeAttribute", () => {
  it("setzt data-theme nur bei expliziter Wahl", () => {
    expect(themeAttribute("system")).toBeUndefined();
    expect(themeAttribute("dark")).toBe("dark");
    expect(themeAttribute("light")).toBe("light");
  });
});

describe("themeCookieValue", () => {
  it("speichert eine explizite Wahl ein Jahr lang", () => {
    const value = themeCookieValue("dark");
    expect(value).toContain(`${THEME_COOKIE}=dark`);
    expect(value).toContain("Max-Age=31536000");
    expect(value).toContain("SameSite=Lax");
    expect(value).toContain("Path=/");
  });

  it("löscht den Cookie bei Auto", () => {
    expect(themeCookieValue("system")).toContain("Max-Age=0");
  });
});

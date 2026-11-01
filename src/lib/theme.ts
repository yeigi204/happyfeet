/**
 * Theme-Wahl (Hell / Dunkel / Auto). Rein und ohne I/O – genutzt von Server (Root-Layout) und Client (ThemeToggle).
 * Spec: docs/superpowers/specs/2026-11-01-rose-design-system-design.md (4.3)
 */

export type ThemePreference = "light" | "dark" | "system";

export const THEME_COOKIE = "hf_theme";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Nur exakt "light" oder "dark" gelten; alles andere (auch manipulierte Werte) ist „Auto“. */
export function parseThemePreference(value: string | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/** Wert für `<html data-theme>`: nur bei expliziter Wahl gesetzt, sonst entscheidet die Systemeinstellung. */
export function themeAttribute(pref: ThemePreference): "light" | "dark" | undefined {
  return pref === "system" ? undefined : pref;
}

/** Cookie-String für `document.cookie`. „Auto“ löscht den Cookie. */
export function themeCookieValue(pref: ThemePreference): string {
  if (pref === "system") return `${THEME_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  return `${THEME_COOKIE}=${pref}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}

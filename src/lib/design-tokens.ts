/**
 * Design-System „Rosé“ – Quelle der Farbwerte für Tests und die Design-System-Seite.
 * `src/app/globals.css` muss exakt diese Werte enthalten (siehe design-tokens.test.ts).
 * Spec: docs/superpowers/specs/2026-11-01-rose-design-system-design.md (3.1, 3.2)
 */

export type TokenName =
  | "canvas"
  | "surface"
  | "surface-2"
  | "line"
  | "line-strong"
  | "ink"
  | "ink-muted"
  | "ink-faint"
  | "accent"
  | "accent-ink"
  | "accent-soft"
  | "accent-strong"
  | "focus"
  | "success"
  | "success-soft"
  | "warning"
  | "warning-soft"
  | "danger"
  | "danger-soft"
  | "premium"
  | "premium-soft";

export const TOKENS: { light: Record<TokenName, string>; dark: Record<TokenName, string> } = {
  light: {
    canvas: "#fffbfa",
    surface: "#ffffff",
    "surface-2": "#fbf1f0",
    line: "#f1e3e1",
    "line-strong": "#e6d2cf",
    ink: "#1e1418",
    "ink-muted": "#7a6670",
    "ink-faint": "#826d77",
    accent: "#c2185b",
    "accent-ink": "#ffffff",
    "accent-soft": "#fce4ec",
    "accent-strong": "#ad1452",
    focus: "#1e1418",
    success: "#1a7d4c",
    "success-soft": "#e3f4ea",
    warning: "#985b00",
    "warning-soft": "#fdf0dc",
    danger: "#c62828",
    "danger-soft": "#fde7e7",
    premium: "#ad1452",
    "premium-soft": "#fce4ec",
  },
  dark: {
    canvas: "#171113",
    surface: "#20181b",
    "surface-2": "#2a2024",
    line: "#33282c",
    "line-strong": "#44363b",
    ink: "#f7eef1",
    "ink-muted": "#b39ca6",
    "ink-faint": "#9a858e",
    accent: "#f06a9c",
    "accent-ink": "#1a1013",
    "accent-soft": "#3b1a27",
    "accent-strong": "#f58bb2",
    focus: "#f7eef1",
    success: "#4cc38a",
    "success-soft": "#16301f",
    warning: "#e7a94a",
    "warning-soft": "#33250f",
    danger: "#ff7b7b",
    "danger-soft": "#3a1717",
    premium: "#f58bb2",
    "premium-soft": "#3b1a27",
  },
};

type Four = [string, string, string, string];

/** Diagrammfarben (dataviz-Validator: alle Prüfungen PASS). Reihenfolge fest: Beere, Blau, Bernstein, Violett. */
export const SERIES: { light: Four; dark: Four } = {
  light: ["#ae1967", "#1f74bf", "#c37f00", "#6d41a9"],
  dark: ["#dc5b92", "#4790d8", "#c38824", "#9470cd"],
};

/** Text auf einer Serienfläche. */
export const ON_SERIES: { light: Four; dark: Four } = {
  light: ["#ffffff", "#ffffff", "#1a1013", "#ffffff"],
  dark: ["#1a1013", "#1a1013", "#1a1013", "#1a1013"],
};

/** Paare (Vordergrund, Hintergrund), die in beiden Modi mindestens 4.5 : 1 erreichen müssen (Spec 7). */
export const CONTRAST_PAIRS: ReadonlyArray<readonly [fg: TokenName, bg: TokenName]> = [
  ["ink", "canvas"],
  ["ink", "surface"],
  ["ink-muted", "canvas"],
  ["ink-muted", "surface"],
  ["ink-faint", "canvas"],
  ["ink-faint", "surface"],
  ["accent-ink", "accent"],
  ["accent-strong", "canvas"],
  ["accent-strong", "accent-soft"],
  ["success", "canvas"],
  ["success", "success-soft"],
  ["warning", "canvas"],
  ["warning", "warning-soft"],
  ["danger", "canvas"],
  ["danger", "danger-soft"],
];

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG-2.1-Kontrastverhältnis zweier Farben im Format `#rrggbb`. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

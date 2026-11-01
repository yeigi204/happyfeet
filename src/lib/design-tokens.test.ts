import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

import { CONTRAST_PAIRS, ON_SERIES, SERIES, TOKENS, contrastRatio, type TokenName } from "./design-tokens";

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

/** Inhalt des ersten Blocks, dessen Kopf `head` enthält (mit Klammer-Zählung, damit verschachtelte Blöcke mitkommen). */
function block(head: string): string {
  // `head {` – damit Erwähnungen in Kommentaren nicht zählen.
  const start = css.indexOf(`${head} {`);
  if (start < 0) throw new Error(`Block "${head}" fehlt in globals.css`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") depth--;
    if (depth === 0) return css.slice(open + 1, i).toLowerCase();
  }
  throw new Error(`Block "${head}" ist nicht geschlossen`);
}

describe("contrastRatio", () => {
  it("rechnet nach WCAG 2.1", () => {
    expect(contrastRatio("#ffffff", "#c2185b")).toBeCloseTo(5.87, 2);
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
  });
});

describe("Token-Kontraste", () => {
  it("every contrast pair meets 4.5:1 in light and dark", () => {
    for (const mode of ["light", "dark"] as const) {
      for (const [fg, bg] of CONTRAST_PAIRS) {
        const ratio = contrastRatio(TOKENS[mode][fg], TOKENS[mode][bg]);
        expect(ratio, `${mode}: ${fg} auf ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("deckt die Paare aus der Spec ab", () => {
    const pairs = CONTRAST_PAIRS.map(([fg, bg]) => `${fg}/${bg}`);
    for (const p of [
      "ink/canvas",
      "ink-muted/surface",
      "ink-faint/canvas",
      "accent-ink/accent",
      "success/success-soft",
      "warning/warning-soft",
      "danger/danger-soft",
      "accent-strong/accent-soft",
    ]) {
      expect(pairs).toContain(p);
    }
  });
});

describe("globals.css", () => {
  // Hell-Werte stehen im `@theme static`-Block (Tailwind emittiert sie auf :root), Dunkel im data-theme-Block.
  const light = block("@theme static");
  const dark = block(':root[data-theme="dark"]');
  const autoDark = block('@media (prefers-color-scheme: dark)');

  it("globals.css stays in sync with design-tokens.ts", () => {
    for (const name of Object.keys(TOKENS.light) as TokenName[]) {
      expect(light, `hell --color-${name}`).toContain(`--color-${name}: ${TOKENS.light[name].toLowerCase()}`);
      expect(dark, `dunkel --color-${name}`).toContain(`--color-${name}: ${TOKENS.dark[name].toLowerCase()}`);
      expect(autoDark, `auto-dunkel --color-${name}`).toContain(`--color-${name}: ${TOKENS.dark[name].toLowerCase()}`);
    }
    SERIES.light.forEach((v, i) => expect(light).toContain(`--color-series-${i + 1}: ${v.toLowerCase()}`));
    SERIES.dark.forEach((v, i) => expect(dark).toContain(`--color-series-${i + 1}: ${v.toLowerCase()}`));
    ON_SERIES.light.forEach((v, i) => expect(light).toContain(`--color-on-series-${i + 1}: ${v.toLowerCase()}`));
    ON_SERIES.dark.forEach((v, i) => expect(dark).toContain(`--color-on-series-${i + 1}: ${v.toLowerCase()}`));
  });

  it("globals.css has no .theme-admin and declares the clerk layer", () => {
    expect(css).not.toContain(".theme-admin");
    expect(css).toContain("@layer theme, base, clerk, components, utilities;");
  });

  it("die Auto-Dunkel-Regel lässt eine explizite Hell-Wahl gewinnen", () => {
    expect(css).toContain(':root:not([data-theme="light"])');
  });

  it("shadow utilities follow the theme so dark mode drops the light glow", async () => {
    // Echte Tailwind-Kompilierung: Tailwind setzt Schatten-Werte direkt in die Utility ein. Nur wenn der Wert
    // eine Variable ist, greift die Dunkel-Überschreibung überhaupt.
    const require = createRequire(import.meta.url);
    const compiler = await compile(css, {
      base: process.cwd(),
      loadStylesheet: async (id: string) => {
        const path = require.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id);
        return { path, base: dirname(path), content: readFileSync(path, "utf8") };
      },
    });
    const out = compiler.build(["shadow-sm", "shadow-md", "shadow-lg"]);
    for (const size of ["sm", "md", "lg"]) {
      const rule = out.match(new RegExp(`\\.shadow-${size} \\{[^}]*\\}`))?.[0] ?? "";
      expect(rule, `shadow-${size}`).toMatch(new RegExp(`--tw-shadow: var\\(--elevation-${size}\\)`));
      // Hell definiert, Dunkel (Auto und explizit) überschrieben – nie `none`: das machte die ganze
      // box-shadow-Liste ungültig und nähme auch Fokus-Ringe (ring-*) mit.
      for (const [name, b] of [["hell", light], ["dunkel", dark], ["auto-dunkel", autoDark]] as const) {
        expect(b, `${name} --elevation-${size}`).toMatch(new RegExp(`--elevation-${size}: (?!none)[^;]+;`));
      }
    }
    expect(dark).toMatch(/--elevation-sm: 0 0 #0000;/);
    expect(autoDark).toMatch(/--elevation-sm: 0 0 #0000;/);
  });
});

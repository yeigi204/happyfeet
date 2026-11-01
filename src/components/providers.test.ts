import { describe, expect, it } from "vitest";

import { TOKENS } from "@/lib/design-tokens";

import { clerkAppearance, clerkLocalization } from "./providers";

function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object") for (const v of Object.values(value)) allStrings(v, out);
  return out;
}

describe("Clerk-Lokalisierung (de-CH)", () => {
  it("enthält kein „ß“ (Schweizer Rechtschreibung)", () => {
    const strings = allStrings(clerkLocalization);
    expect(strings.length).toBeGreaterThan(100);
    expect(strings.filter((s) => s.includes("ß"))).toEqual([]);
  });

  it("spricht in den Einstiegs-Screens per Du an", () => {
    const visible = [
      clerkLocalization.signIn?.start?.title,
      clerkLocalization.signIn?.start?.subtitle,
      clerkLocalization.signIn?.start?.actionText,
      clerkLocalization.signIn?.password?.title,
      clerkLocalization.signUp?.start?.title,
      clerkLocalization.signUp?.start?.subtitle,
      clerkLocalization.signUp?.start?.actionText,
      clerkLocalization.signUp?.emailCode?.title,
      clerkLocalization.signUp?.emailCode?.formSubtitle,
    ];
    for (const text of visible) {
      expect(text).toBeTruthy();
      expect(text).not.toMatch(/\b(Sie|Ihr|Ihre|Ihren|Ihrem)\b/);
    }
  });

  it("behält Übersetzungen ausserhalb der Overrides", () => {
    expect(clerkLocalization.formFieldLabel__emailAddress).toBe("E-Mail-Adresse");
    expect(clerkLocalization.signIn?.start?.actionLink__use_passkey).toBe("Passkey nutzen");
  });
});

describe("Clerk-Appearance", () => {
  it("legt Clerks Stile in den Layer „clerk“ (unter den Tailwind-Utilities)", () => {
    expect(clerkAppearance.cssLayerName).toBe("clerk");
  });

  it("braucht dank Layer keine !-Modifier mehr", () => {
    const classes = Object.values(clerkAppearance.elements).flatMap((value) => value.split(/\s+/).filter(Boolean));
    expect(classes.length).toBeGreaterThan(0);
    expect(classes.filter((c) => c.endsWith("!") || c.startsWith("!"))).toEqual([]);
  });

  it("nutzt Token-Klassen, damit Clerk Hell und Dunkel folgt", () => {
    const joined = Object.values(clerkAppearance.elements).join(" ");
    expect(joined).toContain("bg-surface");
    expect(joined).toContain("text-ink");
  });

  it("Clerk colors follow the theme tokens in light and dark", () => {
    // Clerk-Variablen akzeptieren CSS-Variablen (CssColor = string) – so folgt auch jedes Clerk-Innenteil
    // (Menüs, Modals, Codes, Hinweise) dem Hell-/Dunkelmodus, nicht nur die per `elements` gestylten.
    expect(clerkAppearance.variables).toMatchObject({
      colorPrimary: "var(--color-accent)",
      colorPrimaryForeground: "var(--color-accent-ink)",
      colorDanger: "var(--color-danger)",
      colorBackground: "var(--color-surface)",
      colorForeground: "var(--color-ink)",
      colorMutedForeground: "var(--color-ink-muted)",
      colorInput: "var(--color-surface)",
      colorInputForeground: "var(--color-ink)",
      colorBorder: "var(--color-line-strong)",
      colorNeutral: "var(--color-ink)",
    });
    const colors = Object.entries(clerkAppearance.variables)
      .filter(([key]) => key.startsWith("color"))
      .map(([, value]) => String(value));
    expect(colors.filter((value) => value.startsWith("#"))).toEqual([]);
    for (const value of colors) {
      const token = value.match(/^var\(--color-([a-z0-9-]+)\)$/)?.[1];
      if (token) expect(Object.keys(TOKENS.light), value).toContain(token);
    }
  });
});

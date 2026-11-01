import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/explore" }));

const { Sidebar } = await import("./sidebar");

const markup = renderToStaticMarkup(
  h(Sidebar, {
    items: [{ href: "/explore", label: "Entdecken", icon: "explore" }],
    canPost: false,
    theme: "system",
    account: h("a", { href: "/sign-in", id: "konto" }, "Dev"),
    profile: { name: "Mara Keller", handle: "hf_mara" },
  }),
);

describe("Sidebar-Kontokarte", () => {
  it("account card fits the 236 px sidebar: theme toggle shows words only", () => {
    // Mit Icons und Text braucht der Umschalter ~203 px, die Karte hat innen nur 181 px.
    const toggle = markup.match(/<div role="group" aria-label="Darstellung".*?<\/div>/)?.[0] ?? "";
    expect(toggle).not.toBe("");
    expect(toggle).not.toContain("<svg");
    for (const label of ["Hell", "Dunkel", "Auto"]) expect(toggle).toContain(label);
  });

  it("zeigt Konto, Name und Handle in einer Zeile – Konto zuerst (wie Avatar in der Vorschau)", () => {
    const konto = markup.indexOf('id="konto"');
    expect(konto).toBeGreaterThan(-1);
    expect(konto).toBeLessThan(markup.indexOf("Mara Keller"));
    expect(markup).toContain("@hf_mara");
  });
});

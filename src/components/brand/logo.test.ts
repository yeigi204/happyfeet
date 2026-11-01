import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Logo, LogoMark } from "./logo";

describe("Logo", () => {
  it("verlinkt mit Bildmarke und Wortmarke auf die Startseite", () => {
    const markup = renderToStaticMarkup(h(Logo));
    expect(markup).toContain('href="/"');
    expect(markup).toContain("happyfeet");
    expect(markup).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("rendert ohne href nur ein Bild mit Namen", () => {
    const markup = renderToStaticMarkup(h(Logo, { href: null, withWordmark: false }));
    expect(markup).not.toContain("<a");
    expect(markup).toContain('aria-label="happyfeet"');
  });

  it("färbt die Marke über Tokens (folgt Hell und Dunkel)", () => {
    const markup = renderToStaticMarkup(h(LogoMark));
    expect(markup).toContain("var(--color-accent)");
    expect(markup).toContain("var(--color-accent-ink)");
  });
});

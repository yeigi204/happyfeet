import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  it("labels variant shows only the words, so it fits narrow places", () => {
    const markup = renderToStaticMarkup(h(ThemeToggle, { value: "system", variant: "labels" }));
    expect(markup).not.toContain("<svg");
    for (const label of ["Hell", "Dunkel", "Auto"]) expect(markup).toContain(`>${label}</button>`);
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Auto</);
  });

  it("compact zeigt nur Icons, mit Namen für Screenreader", () => {
    const markup = renderToStaticMarkup(h(ThemeToggle, { value: "dark", variant: "compact" }));
    expect(markup.match(/<svg/g)).toHaveLength(3);
    expect(markup).toContain('aria-label="Darstellung: Dunkel"');
  });
});

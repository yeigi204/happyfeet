import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GuestNav } from "./guest-nav";

const markup = renderToStaticMarkup(h(GuestNav));

/** Klassen des ersten Links auf `href`. */
function linkClasses(href: string): string[] {
  const tag = markup.match(new RegExp(`<a[^>]*href="${href}"[^>]*>`))?.[0];
  expect(tag, `Link auf ${href}`).toBeDefined();
  return (tag!.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/);
}

const hiddenOnPhones = (classes: string[]) => classes.some((c) => c === "hidden" || c === "max-sm:hidden");

describe("GuestNav", () => {
  it("keeps sign-in and sign-up visible on phones", () => {
    expect(hiddenOnPhones(linkClasses("/sign-in"))).toBe(false);
    expect(hiddenOnPhones(linkClasses("/sign-up"))).toBe(false);
  });

  it("verlinkt Entdecken auf jeder Breite, mit Text für Screenreader", () => {
    expect(hiddenOnPhones(linkClasses("/explore"))).toBe(false);
    expect(markup).toMatch(/<a[^>]*href="\/explore"[^>]*>.*Entdecken.*<\/a>/);
  });
});

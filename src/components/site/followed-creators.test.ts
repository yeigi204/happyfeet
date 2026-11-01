import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FollowedCreators } from "./followed-creators";

describe("FollowedCreators", () => {
  it("verlinkt jeden abonnierten Creator auf sein Profil", () => {
    const markup = renderToStaticMarkup(
      h(FollowedCreators, {
        items: [
          { handle: "zehenspiel", displayName: "Nina Zehnder", avatarUrl: null },
          { handle: "lena_barfuss", displayName: "Lena Baumann", avatarUrl: "https://x.test/a.webp" },
        ],
      }),
    );
    expect(markup).toContain('href="/c/zehenspiel"');
    expect(markup).toContain('href="/c/lena_barfuss"');
    expect(markup).toContain("Deine Creator");
  });

  it("rendert ohne Abos nichts", () => {
    expect(renderToStaticMarkup(h(FollowedCreators, { items: [] }))).toBe("");
  });
});

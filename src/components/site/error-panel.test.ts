import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ErrorPanel } from "./error-panel";

describe("ErrorPanel", () => {
  it("shows the German copy and only the digest – never the raw error message", () => {
    const error = Object.assign(new Error("relation \"users\" does not exist"), { digest: "3905378729" });
    const markup = renderToStaticMarkup(h(ErrorPanel, { error, retry: () => {} }));
    expect(markup).toContain("Da ist etwas schiefgelaufen.");
    expect(markup).toContain("Nochmal versuchen");
    expect(markup).toContain("Fehler-ID: 3905378729");
    expect(markup).not.toContain("relation");
    expect(markup).toContain('href="/"');
  });
});

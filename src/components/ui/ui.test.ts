import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Avatar, initials } from "./avatar";
import { Badge } from "./badge";
import { Button, ButtonLink } from "./button";
import { Card } from "./card";
import { cn } from "./cn";
import { EmptyState } from "./empty-state";
import { Field } from "./field";
import { Input } from "./input";
import { Kbd } from "./kbd";
import { PageHeader } from "./page-header";
import { PremiumBadge } from "./premium-badge";
import { Segmented } from "./segmented";
import { Select } from "./select";
import { Stat } from "./stat";
import { Table, TBody, TD, TH, THead, TR } from "./table";
import { Textarea } from "./textarea";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

function attr(markup: string, tag: string, name: string): string | null {
  const m = markup.match(new RegExp(`<${tag}[^>]*\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
}

describe("cn", () => {
  it("joins truthy classes and drops falsy ones", () => {
    expect(cn("a", false, null, undefined, ["b", { c: true, d: false }])).toBe("a b c");
  });
});

describe("Button", () => {
  it("is a non-submitting button by default", () => {
    expect(attr(html(h(Button, null, "Speichern")), "button", "type")).toBe("button");
  });

  it("uses the accent tokens for the primary variant", () => {
    const markup = html(h(Button, { variant: "primary" }, "Freigeben"));
    expect(markup).toContain("bg-accent");
    expect(markup).toContain("text-accent-ink");
  });

  it("keeps an explicit submit type and forwards disabled", () => {
    const markup = html(h(Button, { type: "submit", disabled: true, variant: "danger", size: "sm" }, "Sperren"));
    expect(attr(markup, "button", "type")).toBe("submit");
    expect(markup).toContain("disabled");
    expect(markup).toContain("text-danger");
  });

  it("renders ButtonLink as an anchor with the button look", () => {
    const markup = html(h(ButtonLink, { href: "/studio", variant: "secondary" }, "Zum Studio"));
    expect(attr(markup, "a", "href")).toBe("/studio");
    expect(markup).toContain("border-line-strong");
  });
});

describe("Field", () => {
  it("associates label, hint and control", () => {
    const markup = html(h(Field, { label: "Handle", hint: "3–24 Zeichen", children: h(Input, { name: "handle" }) }));
    const id = attr(markup, "input", "id");
    expect(id).toBeTruthy();
    expect(attr(markup, "label", "for")).toBe(id);
    const describedBy = attr(markup, "input", "aria-describedby") ?? "";
    expect(markup).toContain(`id="${describedBy}"`);
    expect(markup).toContain("3–24 Zeichen");
  });

  it("marks the control invalid and announces the error", () => {
    const markup = html(h(Field, { label: "Preis", error: "Mindestens CHF 4.90", children: h(Input, { name: "price" }) }));
    expect(attr(markup, "input", "aria-invalid")).toBe("true");
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Mindestens CHF 4.90");
  });

  it("keeps an id the caller already set", () => {
    const markup = html(h(Field, { label: "Bio", children: h(Textarea, { id: "bio" }) }));
    expect(attr(markup, "label", "for")).toBe("bio");
    expect(attr(markup, "textarea", "id")).toBe("bio");
  });
});

describe("Select", () => {
  it("renders a native select with the given options", () => {
    const markup = html(h(Select, { name: "filter", defaultValue: "creators" }, h("option", { value: "creators" }, "Creator")));
    expect(markup).toContain("<select");
    expect(markup).toContain("Creator");
  });
});

describe("Card", () => {
  it("renders title as a heading and the action", () => {
    const markup = html(h(Card, { title: "Umsatz 90 Tage", action: h("a", { href: "/x" }, "Alle"), children: "Inhalt" }));
    expect(markup).toMatch(/<h2[^>]*>Umsatz 90 Tage<\/h2>/);
    expect(markup).toContain('href="/x"');
    expect(markup).toContain("border-line");
  });
});

describe("Badge", () => {
  it("pairs status tones with an icon so color never carries meaning alone", () => {
    expect(html(h(Badge, { tone: "danger", children: "Kritisch" }))).toContain("<svg");
    expect(html(h(Badge, { tone: "success", children: "Freigegeben" }))).toContain("<svg");
    expect(html(h(Badge, { tone: "warning", children: "Wartet" }))).toContain("<svg");
  });

  it("keeps neutral badges plain", () => {
    const markup = html(h(Badge, { tone: "neutral", children: "Entwurf" }));
    expect(markup).not.toContain("<svg");
    expect(markup).toContain("Entwurf");
  });
});

describe("PremiumBadge", () => {
  it("labels premium creators", () => {
    expect(html(h(PremiumBadge))).toContain("Premium");
  });
});

describe("Table", () => {
  it("right-aligns numeric cells in tabular mono", () => {
    const markup = html(
      h(
        Table,
        null,
        h(THead, null, h(TR, null, h(TH, null, "Creator"), h(TH, { numeric: true }, "Netto"))),
        h(TBody, null, h(TR, null, h(TD, null, "@lena"), h(TD, { numeric: true }, "CHF 1’234.50"))),
      ),
    );
    const numericTd = markup.match(/<td class="([^"]*)">CHF/);
    expect(numericTd?.[1]).toContain("text-right");
    expect(numericTd?.[1]).toContain("font-num");
    expect(numericTd?.[1]).toContain("tabular-nums");
    expect(markup).toMatch(/<th[^>]*class="[^"]*text-right[^"]*"[^>]*>Netto/);
    expect(markup).toMatch(/<th[^>]*scope="col"/);
  });
});

describe("Stat", () => {
  it("colors an upward delta as good by default and explains it for screen readers", () => {
    const markup = html(h(Stat, { label: "MRR", value: "CHF 48’210.00", delta: { value: "+4.2 %", direction: "up" } }));
    expect(markup).toContain("text-success");
    expect(markup).toContain("gestiegen");
  });

  it("colors a rise as bad when good is false", () => {
    const markup = html(h(Stat, { label: "Kündigungen", value: "38", delta: { value: "+12", direction: "up", good: false } }));
    expect(markup).toContain("text-danger");
  });

  it("keeps a flat delta neutral", () => {
    const markup = html(h(Stat, { label: "Fans", value: "1’204", delta: { value: "±0", direction: "flat" } }));
    expect(markup).toContain("text-ink-muted");
    expect(markup).toContain("unverändert");
  });

  it("sets the currency unit apart from the amount", () => {
    const markup = html(h(Stat, { label: "MRR", value: "CHF 48’210.00" }));
    expect(markup).toMatch(/<span[^>]*data-unit[^>]*>CHF<\/span>/);
    expect(markup.replace(/<[^>]+>/g, "")).toContain("CHF48’210.00");
  });

  it("sets the mono apostrophe tighter so grouped numbers read as one word", () => {
    const markup = html(h(Stat, { label: "Aktive Abos", value: "5’784" }));
    expect(markup).toMatch(/<span class="-mx-\[[\d.]+em\]">’<\/span>/);
    expect(markup.replace(/<[^>]+>/g, "")).toContain("5’784");
  });

  it("renders hint and trend children", () => {
    const markup = html(h(Stat, { label: "Aktive Abos", value: "4’912", hint: "vs. Vormonat" }, h("svg", { "data-trend": "" })));
    expect(markup).toContain("vs. Vormonat");
    expect(markup).toContain("data-trend");
  });
});

describe("Segmented", () => {
  const items = [
    { href: "/admin/verifications?status=pending", label: "Offen", count: 3 },
    { href: "/admin/verifications?status=approved", label: "Freigegeben" },
  ];

  it("marks the active tab for assistive tech and shows counts", () => {
    const markup = html(h(Segmented, { items, active: items[0].href }));
    expect(markup).toMatch(/<a[^>]*aria-current="page"[^>]*>.*Offen/);
    expect(markup).toContain(">3<");
    expect(markup.match(/aria-current/g)).toHaveLength(1);
  });
});

describe("Avatar", () => {
  it("falls back to initials", () => {
    const markup = html(h(Avatar, { name: "Lena Meier" }));
    expect(markup).toContain(">LM<");
  });

  it("uses the image with the name as alt text", () => {
    const markup = html(h(Avatar, { name: "Lena Meier", src: "https://x.test/a.webp", size: "lg" }));
    expect(attr(markup, "img", "alt")).toBe("Lena Meier");
  });

  it("handles a single-word handle", () => {
    expect(html(h(Avatar, { name: "@zehenspitze" }))).toContain(">Z<");
  });

  it("never splits emoji into lone surrogates (hydration-safe initials)", () => {
    expect(initials("🦶 Zehen Fan")).toBe("ZF");
    expect(initials("🦶🦶‍🔥 Fuss 👣")).toBe("F");
    expect(initials("👣")).toBe("");
    expect(initials("Ölzehe 2026")).toBe("Ö2");
    expect(initials("𝓩ara Muster")).toBe("𝓩M");
    expect(initials("Nina Zehnder", 1)).toBe("N");
    const markup = html(h(Avatar, { name: "🦶 Zehen Fan" }));
    expect(markup).toContain(">ZF<");
    expect(/[\uD800-\uDFFF]/.test(markup.replace(/aria-label="[^"]*"/, ""))).toBe(false);
    expect(html(h(Avatar, { name: "👣" }))).toContain(">?<");
  });
});

describe("EmptyState", () => {
  it("shows title, description and action", () => {
    const markup = html(
      h(EmptyState, { title: "Keine offenen Meldungen", description: "Alles erledigt.", action: h("a", { href: "/admin" }, "Zum Dashboard") }),
    );
    expect(markup).toContain("Keine offenen Meldungen");
    expect(markup).toContain("Alles erledigt.");
    expect(markup).toContain('href="/admin"');
  });
});

describe("PageHeader", () => {
  it("renders the page title as h1 with actions", () => {
    const markup = html(h(PageHeader, { title: "Dashboard", description: "Stand heute", actions: h("button", null, "Export") }));
    expect(markup).toMatch(/<h1[^>]*>Dashboard<\/h1>/);
    expect(markup).toContain("Stand heute");
    expect(markup).toContain("Export");
  });
});

describe("Kbd", () => {
  it("renders a kbd element", () => {
    expect(html(h(Kbd, null, "⌘K"))).toMatch(/<kbd[^>]*>⌘K<\/kbd>/);
  });
});

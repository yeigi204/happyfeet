import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/moderation",
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));

const { AdminShell } = await import("./admin-shell");
const { ADMIN_NAV, isNavActive } = await import("./admin-nav");
const { filterCommands, isSafeHref } = await import("./command-palette");
const { QueuePill } = await import("./queue-pill");
const { resolveShortcut, GO_TIMEOUT_MS } = await import("./shortcuts");
const { Ticker } = await import("./ticker");

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

type Key = Parameters<typeof resolveShortcut>[1];
const key = (k: string, extra: Partial<Key> = {}): Key => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  editable: false,
  time: 1000,
  ...extra,
});

describe("resolveShortcut", () => {
  it("navigates with g then a page key", () => {
    const first = resolveShortcut({ pendingSince: null }, key("g"));
    expect(first.action).toEqual({ type: "pending" });
    const second = resolveShortcut(first.state, key("m", { time: 1400 }));
    expect(second.action).toEqual({ type: "navigate", href: "/admin/moderation" });
    expect(second.state.pendingSince).toBeNull();
  });

  it("covers every documented go-key", () => {
    const hrefs = ["d", "v", "m", "u", "p", "s", "a"].map(
      (k) => resolveShortcut({ pendingSince: 1000 }, key(k, { time: 1100 })).action,
    );
    expect(hrefs).toEqual([
      { type: "navigate", href: "/admin" },
      { type: "navigate", href: "/admin/verifications" },
      { type: "navigate", href: "/admin/moderation" },
      { type: "navigate", href: "/admin/users" },
      { type: "navigate", href: "/admin/payouts" },
      { type: "navigate", href: "/admin/settings" },
      { type: "navigate", href: "/admin/audit" },
    ]);
  });

  it("forgets a stale g", () => {
    const r = resolveShortcut({ pendingSince: 1000 }, key("d", { time: 1000 + GO_TIMEOUT_MS + 1 }));
    expect(r.action).toBeNull();
  });

  it("ignores unknown follow-up keys", () => {
    expect(resolveShortcut({ pendingSince: 1000 }, key("x", { time: 1100 })).action).toBeNull();
  });

  it("opens the palette with cmd+k or ctrl+k, even while typing", () => {
    expect(resolveShortcut({ pendingSince: null }, key("k", { metaKey: true })).action).toEqual({ type: "palette" });
    expect(resolveShortcut({ pendingSince: null }, key("K", { ctrlKey: true, editable: true })).action).toEqual({ type: "palette" });
  });

  it("shows help on ?", () => {
    expect(resolveShortcut({ pendingSince: null }, key("?")).action).toEqual({ type: "help" });
  });

  it("does nothing while the user types in a field", () => {
    expect(resolveShortcut({ pendingSince: null }, key("g", { editable: true })).action).toBeNull();
    expect(resolveShortcut({ pendingSince: 1000 }, key("d", { editable: true, time: 1100 })).action).toBeNull();
  });

  it("leaves modified keys to the browser", () => {
    expect(resolveShortcut({ pendingSince: null }, key("g", { altKey: true })).action).toBeNull();
    expect(resolveShortcut({ pendingSince: 1000 }, key("d", { metaKey: true, time: 1100 })).action).toBeNull();
  });
});

describe("isNavActive", () => {
  it("matches the dashboard only exactly", () => {
    expect(isNavActive("/admin", "/admin")).toBe(true);
    expect(isNavActive("/admin/users", "/admin")).toBe(false);
  });

  it("matches sections and their subpages", () => {
    expect(isNavActive("/admin/users", "/admin/users")).toBe(true);
    expect(isNavActive("/admin/users/123", "/admin/users")).toBe(true);
    expect(isNavActive("/admin/usersettings", "/admin/users")).toBe(false);
    expect(isNavActive(null, "/admin/users")).toBe(false);
  });

  it("lists the seven admin areas in order", () => {
    expect(ADMIN_NAV.map((i) => i.href)).toEqual([
      "/admin",
      "/admin/verifications",
      "/admin/moderation",
      "/admin/users",
      "/admin/payouts",
      "/admin/settings",
      "/admin/audit",
    ]);
  });
});

describe("filterCommands", () => {
  const items = [
    { label: "Dashboard", keywords: "übersicht kennzahlen" },
    { label: "Moderation", keywords: "meldungen posts prüfung" },
    { label: "Audit-Log", keywords: "protokoll" },
  ];

  it("returns everything for an empty query", () => {
    expect(filterCommands(items, "  ")).toHaveLength(3);
  });

  it("ranks prefix matches before keyword matches and ignores accents", () => {
    expect(filterCommands(items, "mo").map((i) => i.label)).toEqual(["Moderation"]);
    expect(filterCommands(items, "uebersicht").length).toBe(0);
    expect(filterCommands(items, "ubersicht").map((i) => i.label)).toEqual(["Dashboard"]);
    expect(filterCommands(items, "log").map((i) => i.label)).toEqual(["Audit-Log"]);
  });
});

describe("isSafeHref", () => {
  it("only allows same-origin paths", () => {
    expect(isSafeHref("/admin/users?q=lena")).toBe(true);
    expect(isSafeHref("//evil.test")).toBe(false);
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("https://evil.test")).toBe(false);
  });
});

describe("QueuePill", () => {
  it("hides when there is nothing to do", () => {
    expect(html(h(QueuePill, { count: 0, label: "offene Meldungen" }))).toBe("");
  });

  it("caps large counts and keeps the label for screen readers", () => {
    const markup = html(h(QueuePill, { count: 140, label: "offene Meldungen", tone: "alert" }));
    expect(markup).toContain("99+");
    expect(markup).toContain("offene Meldungen");
    expect(markup).toContain("bg-accent");
  });
});

describe("Ticker", () => {
  it("renders label, value and an accessible delta direction", () => {
    const markup = html(h(Ticker, { items: [{ label: "MRR", value: "CHF 48’210.00", delta: "+4.2 %", direction: "up" }] }));
    expect(markup).toContain("MRR");
    expect(markup).toContain("CHF 48’210.00");
    expect(markup).toContain("+4.2 %");
    expect(markup).toContain("gestiegen");
  });
});

describe("AdminShell", () => {
  const markup = html(
    h(
      AdminShell,
      {
        counts: { verifications: 3, moderation: 6, reports: 7 },
        ticker: [{ label: "Aktive Abos", value: "4’912" }],
      },
      h("p", null, "Seiteninhalt"),
    ),
  );

  it("switches to the admin theme and renders the page", () => {
    expect(markup).toContain("theme-admin");
    expect(markup).toContain("Seiteninhalt");
    expect(markup).toContain('id="admin-main"');
    expect(markup).toContain("Zum Inhalt springen");
  });

  it("links every admin area and marks the current one", () => {
    for (const item of ADMIN_NAV) expect(markup).toContain(`href="${item.href}"`);
    expect(markup).toMatch(/<a[^>]*href="\/admin\/moderation"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="\/admin\/moderation"/);
  });

  it("shows queue counters and the ticker", () => {
    expect(markup).toContain("Posts in Vorab-Prüfung");
    expect(markup).toContain("offene Meldungen");
    expect(markup).toContain("Anträge");
    expect(markup).toContain("4’912");
  });
});

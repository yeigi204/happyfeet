import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/dev-impersonation", () => ({ isDevImpersonation: () => true }));
vi.mock("@/server/auth/viewer", () => ({ getViewer: async () => ({ handle: "hf_mara", clerkId: "seed_admin" }) }));
vi.mock("@clerk/nextjs", () => ({ UserButton: () => null }));

const { UserMenu } = await import("./user-menu");

/** Sichtbarer Text ohne sr-only-Teile. */
const visibleText = (markup: string) =>
  markup.replace(/<span class="sr-only">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, "").trim();

describe("UserMenu (Dev-Impersonation)", () => {
  it("zeigt im Kopf den vollen Chip mit Handle", async () => {
    const markup = renderToStaticMarkup(await UserMenu({}));
    expect(visibleText(markup)).toBe("Dev: @hf_mara");
  });

  it("compact chip shows only Dev and keeps the handle for screen readers", async () => {
    const markup = renderToStaticMarkup(await UserMenu({ compact: true }));
    expect(visibleText(markup)).toBe("Dev");
    expect(markup).toContain("@hf_mara");
    expect(markup).toContain('href="/sign-in"');
  });
});

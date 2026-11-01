import { NextRequest, type NextFetchEvent } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({
  protect: vi.fn(),
  invoked: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clerk/nextjs/server")>();
  type Handler = (auth: unknown, req: NextRequest, event: NextFetchEvent) => unknown;
  return {
    ...actual,
    // Echter Route-Matcher, aber eine Middleware-Attrappe, die nur den Handler mit `auth.protect` aufruft.
    clerkMiddleware: (handler: Handler) => async (req: NextRequest, event: NextFetchEvent) => {
      clerk.invoked(req.nextUrl.pathname);
      await handler(Object.assign(() => ({}), { protect: clerk.protect }), req, event);
      return new Response(null, { headers: { "x-test": "clerk" } });
    },
  };
});

const { default: proxy, config } = await import("./proxy");

const event = {} as NextFetchEvent;
const request = (path: string) => new NextRequest(`http://localhost${path}`);

beforeEach(() => {
  vi.stubEnv("DEV_IMPERSONATE_CLERK_ID", "");
  clerk.protect.mockReset();
  clerk.invoked.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy", () => {
  it.each(["/studio", "/studio/posts/neu", "/admin", "/admin/users", "/feed", "/subscriptions", "/onboarding", "/checkout/abc"])(
    "schützt %s mit auth.protect()",
    async (path) => {
      await proxy(request(path), event);
      expect(clerk.invoked).toHaveBeenCalledWith(path);
      expect(clerk.protect).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["/", "/explore", "/c/anna", "/sign-in", "/sign-up/verify", "/banned", "/api/webhooks/clerk", "/api/media/x"])(
    "lässt %s öffentlich (Clerk läuft, aber ohne protect)",
    async (path) => {
      await proxy(request(path), event);
      expect(clerk.invoked).toHaveBeenCalledWith(path);
      expect(clerk.protect).not.toHaveBeenCalled();
    },
  );

  it("reicht bei Dev-Impersonation durch, ohne Clerk aufzurufen", async () => {
    vi.stubEnv("DEV_IMPERSONATE_CLERK_ID", "seed_admin");
    const res = await proxy(request("/admin"), event);
    expect(clerk.invoked).not.toHaveBeenCalled();
    expect(clerk.protect).not.toHaveBeenCalled();
    expect(res?.headers.get("x-middleware-next")).toBe("1");
  });

  it("wirft in Produktion mit gesetzter Impersonation (harte Fehlkonfiguration)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_IMPERSONATE_CLERK_ID", "seed_admin");
    expect(() => proxy(request("/"), event)).toThrow(/DEV_IMPERSONATE_CLERK_ID/);
  });

  it("hat einen Matcher für Seiten und API-Routen", () => {
    expect(config.matcher).toEqual(expect.arrayContaining([expect.stringContaining("api")]));
  });
});

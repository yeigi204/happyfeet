import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { users } from "@/server/db/schema";

import { setupTestDb } from "../../../tests/helpers/db";
import { createCreator, createUser } from "../../../tests/helpers/factories";

const clerk = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => clerk);

/** Request-Header, wie der Proxy sie setzt; `null` = kein Request-Kontext (headers() wirft). */
const request = vi.hoisted(() => ({ headers: null as Headers | null }));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => {
    if (!request.headers) throw new Error("kein Request-Kontext");
    return request.headers;
  }),
  cookies: vi.fn(async () => {
    throw new Error("kein Request-Kontext");
  }),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

const { getViewer, requireAdmin, requireCreator, requireOnboardedViewer, requireViewer } = await import("./viewer");

// setupTestDb ist kein React-Hook, sondern registriert Vitest-Hooks (Namenskonvention aus tests/helpers/db.ts).
const t = setupTestDb();

function signedInAs(clerkId: string | null) {
  clerk.auth.mockResolvedValue({ userId: clerkId });
}

beforeEach(() => {
  request.headers = null;
  vi.stubEnv("DEV_IMPERSONATE_CLERK_ID", "");
  clerk.auth.mockReset();
  clerk.currentUser.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getViewer (Clerk)", () => {
  it("liefert null ohne Clerk-Session", async () => {
    signedInAs(null);
    expect(await getViewer()).toBeNull();
    expect(clerk.currentUser).not.toHaveBeenCalled();
  });

  it("liefert den Viewer eines bekannten Nutzers ohne Clerk-Profilabruf", async () => {
    const user = await createUser(t.db, { clerkId: "user_known", isAdmin: true });
    signedInAs("user_known");
    expect(await getViewer()).toMatchObject({ id: user.id, isAdmin: true, onboarded: true });
    expect(clerk.currentUser).not.toHaveBeenCalled();
  });

  it("legt einen fehlenden Nutzer lazy aus dem Clerk-Profil an (Fallback ohne Webhook)", async () => {
    signedInAs("user_lazy");
    clerk.currentUser.mockResolvedValue({
      id: "user_lazy",
      imageUrl: "https://img.clerk.com/x.png",
      primaryEmailAddress: { emailAddress: "lazy@example.ch", verification: { status: "verified" } },
    });
    const viewer = await getViewer();
    expect(viewer).toMatchObject({ clerkId: "user_lazy", email: "lazy@example.ch", onboarded: false, creator: null });
    const rows = await t.db.select().from(users).where(eq(users.clerkId, "user_lazy"));
    expect(rows).toHaveLength(1);
  });

  it("übernimmt bei der Lazy-Anlage keine unbestätigte E-Mail", async () => {
    signedInAs("user_unverified");
    clerk.currentUser.mockResolvedValue({
      id: "user_unverified",
      primaryEmailAddress: { emailAddress: "boss@example.ch", verification: { status: "unverified" } },
    });
    expect(await getViewer()).toMatchObject({ clerkId: "user_unverified", email: null });
  });

  it("legt den Nutzer auch an, wenn das Clerk-Profil nicht abrufbar ist", async () => {
    signedInAs("user_clerk_down");
    clerk.currentUser.mockRejectedValue(new Error("Clerk API nicht erreichbar"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await getViewer()).toMatchObject({ clerkId: "user_clerk_down", email: null, onboarded: false });
    warn.mockRestore();
  });

  it("legt den Nutzer auch an, wenn Clerk kein Profil liefert", async () => {
    signedInAs("user_noprofile");
    clerk.currentUser.mockResolvedValue(null);
    expect(await getViewer()).toMatchObject({ clerkId: "user_noprofile", email: null });
  });
});

describe("getViewer (Dev-Impersonation)", () => {
  it("meldet den Seed-User an, ohne Clerk aufzurufen", async () => {
    const user = await createUser(t.db, { clerkId: "seed_admin", isAdmin: true });
    vi.stubEnv("DEV_IMPERSONATE_CLERK_ID", "seed_admin");
    expect(await getViewer()).toMatchObject({ id: user.id, clerkId: "seed_admin", isAdmin: true });
    expect(clerk.auth).not.toHaveBeenCalled();
    expect(clerk.currentUser).not.toHaveBeenCalled();
  });

  it("liefert null, wenn der Seed-User fehlt – legt nichts an und ruft Clerk nicht auf", async () => {
    vi.stubEnv("DEV_IMPERSONATE_CLERK_ID", "seed_missing");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await getViewer()).toBeNull();
    expect(clerk.auth).not.toHaveBeenCalled();
    expect(await t.db.select().from(users)).toHaveLength(0);
    warn.mockRestore();
  });
});

describe("require*", () => {
  it("requireViewer leitet Abgemeldete zu /sign-in", async () => {
    signedInAs(null);
    await expect(requireViewer()).rejects.toThrow("REDIRECT:/sign-in");
  });

  it("requireViewer gibt den aktuellen Pfad (vom Proxy) als redirect_url mit", async () => {
    signedInAs(null);
    request.headers = new Headers({ "x-hf-return-path": "/studio/become-creator" });
    await expect(requireViewer()).rejects.toThrow("REDIRECT:/sign-in?redirect_url=%2Fstudio%2Fbecome-creator");
  });

  it("requireViewer übernimmt keinen fremden Rücksprung (Open Redirect)", async () => {
    signedInAs(null);
    request.headers = new Headers({ "x-hf-return-path": "//evil.example/x" });
    await expect(requireViewer()).rejects.toThrow(/^REDIRECT:\/sign-in$/);
  });

  it("requireOnboardedViewer gibt den Rücksprung auch ans Onboarding weiter", async () => {
    await createUser(t.db, { clerkId: "user_new2", handle: null, onboardedAt: null });
    signedInAs("user_new2");
    request.headers = new Headers({ "x-hf-return-path": "/c/zehenspiel" });
    await expect(requireOnboardedViewer()).rejects.toThrow("REDIRECT:/onboarding?redirect_url=%2Fc%2Fzehenspiel");
  });

  it("requireOnboardedViewer leitet gesperrte Nutzer zu /banned", async () => {
    await createUser(t.db, { clerkId: "user_banned", status: "banned" });
    signedInAs("user_banned");
    await expect(requireOnboardedViewer()).rejects.toThrow("REDIRECT:/banned");
  });

  it("requireOnboardedViewer leitet Nutzer ohne Onboarding zu /onboarding", async () => {
    await createUser(t.db, { clerkId: "user_new", handle: null, onboardedAt: null });
    signedInAs("user_new");
    await expect(requireOnboardedViewer()).rejects.toThrow("REDIRECT:/onboarding");
  });

  it("requireOnboardedViewer liefert onboardete Nutzer", async () => {
    const user = await createUser(t.db, { clerkId: "user_ok" });
    signedInAs("user_ok");
    await expect(requireOnboardedViewer()).resolves.toMatchObject({ id: user.id });
  });

  it("requireCreator leitet Nutzer ohne Profil zu /studio/become-creator", async () => {
    await createUser(t.db, { clerkId: "user_fan" });
    signedInAs("user_fan");
    await expect(requireCreator()).rejects.toThrow("REDIRECT:/studio/become-creator");
  });

  it("requireCreator liefert Creator (auch mit ausstehender Prüfung)", async () => {
    await createCreator(t.db, { user: { clerkId: "user_creator" }, profile: { verificationStatus: "pending" } });
    signedInAs("user_creator");
    const viewer = await requireCreator();
    expect(viewer.creator.verificationStatus).toBe("pending");
  });

  it("requireAdmin antwortet Abgemeldeten, Nicht-Admins und gesperrten Admins mit 404", async () => {
    signedInAs(null);
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");

    await createUser(t.db, { clerkId: "user_fan" });
    signedInAs("user_fan");
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");

    await createUser(t.db, { clerkId: "user_banned_admin", isAdmin: true, status: "banned" });
    signedInAs("user_banned_admin");
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
  });

  it("requireAdmin liefert aktive Admins", async () => {
    const admin = await createUser(t.db, { clerkId: "user_admin", isAdmin: true });
    signedInAs("user_admin");
    await expect(requireAdmin()).resolves.toMatchObject({ id: admin.id, isAdmin: true });
  });
});

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Viewer } from "@/lib/domain/types";
import { users } from "@/server/db/schema";

import { useTestDb } from "../../../../tests/helpers/db";
import { createUser, viewerFor } from "../../../../tests/helpers/factories";

const auth = vi.hoisted(() => ({ viewer: null as Viewer | null }));
const nav = vi.hoisted(() => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/auth/viewer", () => ({
  getViewer: vi.fn(async () => auth.viewer),
  requireViewer: vi.fn(async () => {
    if (!auth.viewer) throw new Error("REDIRECT:/sign-in");
    return auth.viewer;
  }),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: nav.revalidatePath }));

const { checkHandleAvailability, submitOnboarding } = await import("./actions");

// useTestDb ist kein React-Hook, sondern registriert Vitest-Hooks (Namenskonvention aus tests/helpers/db.ts).
// eslint-disable-next-line react-hooks/rules-of-hooks
const t = useTestDb();

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const valid = { handle: "@Lena_Bern", displayName: "Lena", birthDate: "1994-06-03", confirmAdult: "on" };

async function signInFresh(overrides: Partial<typeof users.$inferInsert> = {}) {
  const user = await createUser(t.db, {
    handle: null,
    displayName: null,
    birthDate: null,
    ageConfirmedAt: null,
    onboardedAt: null,
    ...overrides,
  });
  auth.viewer = await viewerFor(t.db, user.id);
  return user;
}

beforeEach(() => {
  auth.viewer = null;
  nav.revalidatePath.mockReset();
});

describe("submitOnboarding", () => {
  it("speichert das Profil und leitet zu /explore weiter", async () => {
    const user = await signInFresh();
    await expect(submitOnboarding({}, form(valid))).rejects.toThrow("REDIRECT:/explore");
    const [row] = await t.db.select().from(users).where(eq(users.id, user.id));
    expect(row).toMatchObject({ handle: "lena_bern", displayName: "Lena", birthDate: "1994-06-03" });
    expect(row.onboardedAt).not.toBeNull();
    expect(nav.revalidatePath).toHaveBeenCalled();
  });

  it("liefert Feldfehler und behält die Eingaben", async () => {
    await signInFresh();
    const state = await submitOnboarding({}, form({ ...valid, birthDate: "2015-01-01", confirmAdult: "" }));
    expect(state.fieldErrors?.birthDate).toBeDefined();
    expect(state.fieldErrors?.confirmAdult).toBeDefined();
    expect(state.values).toEqual({ handle: "@Lena_Bern", displayName: "Lena", birthDate: "2015-01-01", confirmAdult: false });
  });

  it("ordnet einen vergebenen Handle dem Feld handle zu", async () => {
    await createUser(t.db, { handle: "lena_bern" });
    await signInFresh();
    const state = await submitOnboarding({}, form(valid));
    expect(state.fieldErrors?.handle?.[0]).toMatch(/vergeben/);
  });

  it("leitet bereits onboardete Nutzer direkt zu /explore", async () => {
    const user = await createUser(t.db);
    auth.viewer = await viewerFor(t.db, user.id);
    await expect(submitOnboarding({}, form(valid))).rejects.toThrow("REDIRECT:/explore");
  });

  it("leitet gesperrte Nutzer zu /banned", async () => {
    await signInFresh({ status: "banned" });
    await expect(submitOnboarding({}, form(valid))).rejects.toThrow("REDIRECT:/banned");
  });
});

describe("checkHandleAvailability", () => {
  it("meldet freie Handles als verfügbar", async () => {
    await signInFresh();
    expect(await checkHandleAvailability("@Neu_Hier")).toEqual({ status: "available", handle: "neu_hier" });
  });

  it("meldet vergebene Handles", async () => {
    await createUser(t.db, { handle: "schon_da" });
    await signInFresh();
    expect(await checkHandleAvailability("schon_da")).toEqual({ status: "taken", handle: "schon_da" });
  });

  it("meldet ungültige und reservierte Handles mit Grund", async () => {
    await signInFresh();
    expect(await checkHandleAvailability("ab")).toMatchObject({ status: "invalid" });
    expect(await checkHandleAvailability("admin")).toMatchObject({ status: "invalid", reason: expect.stringMatching(/reserviert/) });
  });

  it("antwortet Abgemeldeten nicht", async () => {
    expect(await checkHandleAvailability("frei_123")).toEqual({ status: "invalid", reason: "Bitte melde dich an." });
  });
});

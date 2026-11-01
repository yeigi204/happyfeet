import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Viewer } from "@/lib/domain/types";
import { auditLog, creatorProfiles, platformSettings, posts, users } from "@/server/db/schema";
import { AuthError, ForbiddenError } from "@/server/errors";
import * as auditService from "@/server/services/admin/audit";
import * as dashboardService from "@/server/services/admin/dashboard";
import * as moderationService from "@/server/services/admin/moderation";
import * as settingsService from "@/server/services/admin/settings";
import * as usersService from "@/server/services/admin/users";
import * as verificationsService from "@/server/services/admin/verifications";
import { setMediaStorageForTesting } from "@/server/storage";
import { InMemoryMediaStorage } from "@/server/storage/memory";

import { setupTestDb } from "../../helpers/db";
import { createAdmin, createCreator, createPost, createUser, viewerFor } from "../../helpers/factories";
import { insertReport } from "../../helpers/task9";

const t = setupTestDb();

beforeAll(() => setMediaStorageForTesting(new InMemoryMediaStorage()));
afterAll(() => setMediaStorageForTesting(null));

const MODULES = {
  dashboard: dashboardService,
  verifications: verificationsService,
  moderation: moderationService,
  users: usersService,
  settings: settingsService,
  audit: auditService,
} as const;

type AnyFn = (...args: unknown[]) => unknown;

function exportedFunctions(): [string, AnyFn][] {
  return Object.entries(MODULES).flatMap(([moduleName, mod]) =>
    Object.entries(mod as Record<string, unknown>)
      .filter((entry): entry is [string, AnyFn] => typeof entry[1] === "function")
      .map(([name, fn]) => [`${moduleName}.${name}`, fn] as [string, AnyFn]),
  );
}

/** Ruft `fn` auf und liefert den Fehler (synchrone Würfe zählen wie abgelehnte Promises). */
async function errorOf(fn: AnyFn, args: unknown[]): Promise<unknown> {
  try {
    await Promise.resolve().then(() => fn(...args));
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("every admin service rejects non-admins", () => {
  it("jedes Modul exportiert nur Funktionen (Typen ausgenommen) und mindestens eine", () => {
    for (const [moduleName, mod] of Object.entries(MODULES)) {
      const values = Object.values(mod as Record<string, unknown>);
      expect(values.length, moduleName).toBeGreaterThan(0);
      for (const value of values) expect(typeof value, moduleName).toBe("function");
    }
    // dashboard 1 · verifications 3 · moderation 6 · users 4 · settings 1 · audit 1
    expect(exportedFunctions().length).toBeGreaterThanOrEqual(16);
  });

  it("wirft ForbiddenError für Nicht-Admins (Fan, Creator, gesperrter Admin) und AuthError für null – ohne Seiteneffekte", async () => {
    const fan = await createUser(t.db, { handle: "fan_frieda" });
    const { user: creator } = await createCreator(t.db, {
      user: { handle: "creator_carla" },
      profile: { verificationStatus: "pending" },
    });
    const bannedAdmin = await createAdmin(t.db, { handle: "ex_admin", status: "banned" });
    const victim = await createUser(t.db, { handle: "opfer_otto" });
    const post = await createPost(t.db, creator.id, { moderationStatus: "pending" });
    const report = await insertReport(t.db, { postId: post.id, reporterId: fan.id, reason: "spam" });

    const viewers: [string, Viewer][] = [
      ["fan", await viewerFor(t.db, fan.id)],
      ["creator", await viewerFor(t.db, creator.id)],
      ["gesperrter Admin", await viewerFor(t.db, bannedAdmin.id)],
    ];
    // Plausible Argumente: Fehlte der Guard, würde die Funktion etwas tun (oder mit einem anderen Fehler scheitern).
    const argsFor = (name: string): unknown[] => {
      if (name.startsWith("moderation.") && name.includes("Report")) return [report.id, "Notiz"];
      if (name.startsWith("moderation.")) return [post.id, "Notiz"];
      if (name.startsWith("verifications.") && name !== "verifications.listVerificationQueue") {
        return [creator.id, "Notiz"];
      }
      if (name === "users.banUser" || name === "users.unbanUser") return [victim.id, "Grund"];
      if (name === "users.quickSearch") return ["opfer"];
      if (name === "settings.updatePlatformSettings") return [{ premoderationCount: 7 }];
      return [undefined];
    };

    const functions = exportedFunctions();
    for (const [name, fn] of functions) {
      for (const [label, viewer] of viewers) {
        const error = await errorOf(fn, [viewer, ...argsFor(name)]);
        expect(error, `${name} als ${label}`).toBeInstanceOf(ForbiddenError);
      }
      const anonymous = await errorOf(fn, [null as unknown as Viewer, ...argsFor(name)]);
      expect(anonymous, `${name} ohne Anmeldung`).toBeInstanceOf(AuthError);
    }

    // Nichts wurde verändert.
    expect(await t.db.select().from(auditLog)).toHaveLength(0);
    const [victimRow] = await t.db.select().from(users).where(eq(users.id, victim.id));
    expect(victimRow.status).toBe("active");
    const [profile] = await t.db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, creator.id));
    expect(profile.verificationStatus).toBe("pending");
    const [postRow] = await t.db.select().from(posts).where(eq(posts.id, post.id));
    expect(postRow.moderationStatus).toBe("pending");
    const [settings] = await t.db.select().from(platformSettings);
    expect(settings.premoderationCount).toBe(5);
  });

  it("lässt aktive Admins durch", async () => {
    const admin = await viewerFor(t.db, (await createAdmin(t.db)).id);
    await expect(dashboardService.getAdminDashboard(admin)).resolves.toBeDefined();
    await expect(auditService.listAuditLog(admin)).resolves.toEqual([]);
  });
});

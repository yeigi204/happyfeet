import { describe, expect, it } from "vitest";

import type { Viewer } from "@/lib/domain/types";
import { AuthError, ForbiddenError } from "@/server/errors";

import {
  assertActive,
  assertAdmin,
  assertApprovedCreator,
  assertAuthenticated,
  assertCreator,
  assertOnboarded,
} from "./guards";

function viewer(overrides: Partial<Viewer> = {}): Viewer {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    clerkId: "user_test",
    email: "anna@example.ch",
    handle: "anna",
    displayName: "Anna",
    avatarKey: null,
    isAdmin: false,
    status: "active",
    onboarded: true,
    creator: null,
    ...overrides,
  };
}

const banned = () => viewer({ status: "banned" });
const notOnboarded = () => viewer({ onboarded: false, handle: null, displayName: null });
const admin = () => viewer({ isAdmin: true });
const creator = (verificationStatus: "pending" | "approved" | "rejected" = "approved") =>
  viewer({ creator: { verificationStatus, isPremium: false } });

describe("assertAuthenticated", () => {
  it("wirft AuthError ohne Viewer", () => {
    expect(() => assertAuthenticated(null)).toThrow(AuthError);
  });

  it("lässt jeden angemeldeten Viewer durch – auch gesperrte und nicht onboardete", () => {
    expect(() => assertAuthenticated(viewer())).not.toThrow();
    expect(() => assertAuthenticated(banned())).not.toThrow();
    expect(() => assertAuthenticated(notOnboarded())).not.toThrow();
  });
});

describe("assertActive", () => {
  it("wirft AuthError ohne Viewer", () => {
    expect(() => assertActive(null)).toThrow(AuthError);
  });

  it("wirft ForbiddenError mit Sperr-Hinweis für gesperrte Nutzer", () => {
    expect(() => assertActive(banned())).toThrow(ForbiddenError);
    expect(() => assertActive(banned())).toThrow("Dein Konto ist gesperrt.");
  });

  it("lässt aktive Nutzer durch (auch ohne Onboarding)", () => {
    expect(() => assertActive(viewer())).not.toThrow();
    expect(() => assertActive(notOnboarded())).not.toThrow();
  });
});

describe("assertOnboarded", () => {
  it("wirft AuthError ohne Viewer", () => {
    expect(() => assertOnboarded(null)).toThrow(AuthError);
  });

  it("wirft für gesperrte Nutzer den Sperr-Hinweis, auch wenn onboardet", () => {
    expect(() => assertOnboarded(banned())).toThrow("Dein Konto ist gesperrt.");
  });

  it("wirft ForbiddenError ohne abgeschlossenes Onboarding", () => {
    expect(() => assertOnboarded(notOnboarded())).toThrow(ForbiddenError);
  });

  it("lässt onboardete, aktive Nutzer durch", () => {
    expect(() => assertOnboarded(viewer())).not.toThrow();
  });
});

describe("assertAdmin", () => {
  it("wirft AuthError ohne Viewer", () => {
    expect(() => assertAdmin(null)).toThrow(AuthError);
  });

  it("wirft ForbiddenError für Nicht-Admins – auch für Creator", () => {
    expect(() => assertAdmin(viewer())).toThrow(ForbiddenError);
    expect(() => assertAdmin(creator())).toThrow(ForbiddenError);
  });

  it("wirft ForbiddenError für gesperrte Admins", () => {
    expect(() => assertAdmin(viewer({ isAdmin: true, status: "banned" }))).toThrow("Dein Konto ist gesperrt.");
  });

  it("lässt aktive Admins durch", () => {
    expect(() => assertAdmin(admin())).not.toThrow();
  });
});

describe("assertCreator", () => {
  it("wirft AuthError ohne Viewer", () => {
    expect(() => assertCreator(null)).toThrow(AuthError);
  });

  it("wirft ForbiddenError ohne Creator-Profil – auch für Admins", () => {
    expect(() => assertCreator(viewer())).toThrow(ForbiddenError);
    expect(() => assertCreator(admin())).toThrow(ForbiddenError);
  });

  it("wirft für gesperrte Creator den Sperr-Hinweis", () => {
    expect(() =>
      assertCreator(viewer({ status: "banned", creator: { verificationStatus: "approved", isPremium: true } })),
    ).toThrow("Dein Konto ist gesperrt.");
  });

  it("wirft für Creator ohne Onboarding", () => {
    expect(() =>
      assertCreator(viewer({ onboarded: false, creator: { verificationStatus: "approved", isPremium: false } })),
    ).toThrow(ForbiddenError);
  });

  it("lässt Creator unabhängig vom Prüfstatus durch", () => {
    expect(() => assertCreator(creator("pending"))).not.toThrow();
    expect(() => assertCreator(creator("rejected"))).not.toThrow();
    expect(() => assertCreator(creator("approved"))).not.toThrow();
  });

  it("verengt den Typ auf ein vorhandenes Creator-Profil", () => {
    const v: Viewer | null = creator("approved");
    assertCreator(v);
    expect(v.creator.verificationStatus).toBe("approved");
  });
});

describe("assertApprovedCreator", () => {
  it("wirft AuthError ohne Viewer", () => {
    expect(() => assertApprovedCreator(null)).toThrow(AuthError);
  });

  it("wirft ForbiddenError ohne Creator-Profil", () => {
    expect(() => assertApprovedCreator(viewer())).toThrow(ForbiddenError);
  });

  it("wirft ForbiddenError für ausstehende und abgelehnte Creator", () => {
    expect(() => assertApprovedCreator(creator("pending"))).toThrow(ForbiddenError);
    expect(() => assertApprovedCreator(creator("rejected"))).toThrow(ForbiddenError);
  });

  it("wirft für gesperrte, freigeschaltete Creator den Sperr-Hinweis", () => {
    expect(() =>
      assertApprovedCreator(viewer({ status: "banned", creator: { verificationStatus: "approved", isPremium: false } })),
    ).toThrow("Dein Konto ist gesperrt.");
  });

  it("lässt freigeschaltete Creator durch", () => {
    expect(() => assertApprovedCreator(creator("approved"))).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";

import type { Viewer } from "@/lib/domain/types";

import { SHELL_MAIN_CLASSES, canPost, isNavItemActive, navItemsFor } from "./nav-items";

function viewer(overrides: Partial<Viewer> = {}): Viewer {
  return {
    id: "u1",
    clerkId: "seed_fan_1",
    email: null,
    handle: "luca_m",
    displayName: "Luca Müller",
    avatarKey: null,
    isAdmin: false,
    status: "active",
    onboarded: true,
    creator: null,
    ...overrides,
  };
}

const labels = (v: Viewer | null) => navItemsFor(v).map((i) => i.label);

describe("navItemsFor", () => {
  it("Gäste bekommen keine App-Navigation (eigene Gast-Navigation)", () => {
    expect(navItemsFor(null)).toEqual([]);
    expect(canPost(null)).toBe(false);
  });

  it("Gesperrte sehen nur Entdecken und Sperre", () => {
    expect(labels(viewer({ status: "banned" }))).toEqual(["Entdecken", "Sperre"]);
  });

  it("Fans sehen Feed, Entdecken, Abos und Studio", () => {
    const fan = viewer();
    expect(labels(fan)).toEqual(["Feed", "Entdecken", "Abos", "Studio"]);
    expect(canPost(fan)).toBe(false);
  });

  it("nur aktive Admins sehen den Admin-Link", () => {
    expect(labels(viewer({ isAdmin: true }))).toContain("Admin");
    expect(labels(viewer({ isAdmin: true, status: "banned" }))).not.toContain("Admin");
  });
});

describe("canPost", () => {
  it("nur freigegebene, aktive Creator sehen den Plus-Button", () => {
    expect(canPost(viewer({ creator: { verificationStatus: "approved", isPremium: false } }))).toBe(true);
    expect(canPost(viewer({ creator: { verificationStatus: "pending", isPremium: false } }))).toBe(false);
    expect(canPost(viewer({ creator: { verificationStatus: "rejected", isPremium: false } }))).toBe(false);
    expect(canPost(viewer({ status: "banned", creator: { verificationStatus: "approved", isPremium: true } }))).toBe(false);
  });
});

describe("isNavItemActive", () => {
  it("markiert den Bereich auch auf Unterseiten", () => {
    expect(isNavItemActive("/studio/posts/new", "/studio")).toBe(true);
    expect(isNavItemActive("/feed", "/feed")).toBe(true);
    expect(isNavItemActive("/feedback", "/feed")).toBe(false);
  });
});

describe("SHELL_MAIN_CLASSES", () => {
  it("main reserves space for the tab bar", () => {
    expect(SHELL_MAIN_CLASSES).toContain("safe-area-inset-bottom");
    expect(SHELL_MAIN_CLASSES).toContain("lg:pb-0");
  });
});

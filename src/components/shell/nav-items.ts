/**
 * Navigation der App-Shell (Fan-Bereich und Studio) – reine Logik, getestet in nav-items.test.ts.
 * Spec: docs/superpowers/specs/2026-11-01-rose-design-system-design.md (4.4)
 */
import type { Viewer } from "@/lib/domain/types";

export type ShellNavIcon = "feed" | "explore" | "subs" | "studio" | "admin" | "banned";
export type ShellNavItem = { href: string; label: string; icon: ShellNavIcon };

/** Gast → keine App-Navigation; gesperrt → Entdecken + Sperre; aktiv → Feed, Entdecken, Abos, Studio (+ Admin). */
export function navItemsFor(viewer: Viewer | null): ShellNavItem[] {
  if (!viewer) return [];
  const explore: ShellNavItem = { href: "/explore", label: "Entdecken", icon: "explore" };
  if (viewer.status !== "active") return [explore, { href: "/banned", label: "Sperre", icon: "banned" }];
  const items: ShellNavItem[] = [
    { href: "/feed", label: "Feed", icon: "feed" },
    explore,
    { href: "/subscriptions", label: "Abos", icon: "subs" },
    { href: "/studio", label: "Studio", icon: "studio" },
  ];
  if (viewer.isAdmin) items.push({ href: "/admin", label: "Admin", icon: "admin" });
  return items;
}

/** „Neuer Post“ (Plus-Button) nur für aktive, freigegebene Creator. */
export function canPost(viewer: Viewer | null): boolean {
  return viewer?.status === "active" && viewer.creator?.verificationStatus === "approved";
}

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Platz für die fixe mobile Tab-Leiste (inkl. Safe-Area), ab `lg` (Seitenleiste) nicht nötig. */
export const SHELL_MAIN_CLASSES = "pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-0";

export const NEW_POST_HREF = "/studio/posts/new";

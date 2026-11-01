import type { ReactNode } from "react";

import { UserMenu } from "@/components/auth/user-menu";
import { SiteFooter } from "@/components/site/site-footer";
import { cn } from "@/components/ui/cn";
import { getViewer } from "@/server/auth/viewer";
import { getThemePreference } from "@/server/theme";

import { GuestNav } from "./guest-nav";
import { MobileTopBar } from "./mobile-top-bar";
import { SHELL_MAIN_CLASSES, canPost, navItemsFor } from "./nav-items";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";

function SkipLink() {
  return (
    <a
      href="#inhalt"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-canvas"
    >
      Zum Inhalt springen
    </a>
  );
}

/**
 * Rahmen für Fan-Bereich, öffentliche Seiten und Studio.
 * Gäste: obere Gast-Navigation + Fusszeile (mit Darstellung). Angemeldet: Seitenleiste ab `lg`,
 * darunter obere Leiste + fixe Tab-Leiste. Liest Viewer und Theme-Wahl selbst.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const [viewer, theme] = await Promise.all([getViewer(), getThemePreference()]);

  if (!viewer) {
    return (
      <div className="flex min-h-dvh flex-col bg-canvas text-ink">
        <SkipLink />
        <GuestNav />
        <main id="inhalt" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <SiteFooter theme={theme} />
      </div>
    );
  }

  const items = navItemsFor(viewer);
  const post = canPost(viewer);
  const account = <UserMenu />;
  const name = viewer.displayName ?? (viewer.handle ? `@${viewer.handle}` : "Dein Konto");

  return (
    <div className="min-h-dvh bg-canvas text-ink lg:grid lg:grid-cols-[236px_minmax(0,1fr)]">
      <SkipLink />
      <Sidebar items={items} canPost={post} theme={theme} account={account} profile={{ name, handle: viewer.handle }} />
      <div className="flex min-w-0 flex-col">
        <MobileTopBar theme={theme} account={account} showAdmin={viewer.isAdmin && viewer.status === "active"} />
        <main id="inhalt" tabIndex={-1} className={cn("flex-1 outline-none", SHELL_MAIN_CLASSES)}>
          {children}
          <SiteFooter />
        </main>
      </div>
      <TabBar items={items} canPost={post} />
    </div>
  );
}

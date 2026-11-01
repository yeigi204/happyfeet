import { SignInButtonLink, SignUpButtonLink } from "@/components/auth/auth-links";
import { UserMenu } from "@/components/auth/user-menu";
import { cn } from "@/components/ui/cn";
import type { Viewer } from "@/lib/domain/types";
import { getViewer } from "@/server/auth/viewer";

import { Container } from "./container";
import { SiteNav, type SiteNavItem } from "./site-nav";
import { Logo } from "@/components/brand/logo";

function navItemsFor(viewer: Viewer | null): SiteNavItem[] {
  const items: SiteNavItem[] = [{ href: "/explore", label: "Entdecken" }];
  if (!viewer) return items;
  // Gesperrte erreichen Feed, Abos und Studio ohnehin nicht – statt toter Links der Weg zur Sperr-Info.
  if (viewer.status !== "active") return [...items, { href: "/banned", label: "Sperre" }];
  items.push({ href: "/feed", label: "Feed" }, { href: "/subscriptions", label: "Abos" }, { href: "/studio", label: "Studio" });
  if (viewer.isAdmin) items.push({ href: "/admin", label: "Admin" });
  return items;
}

/**
 * Kopfzeile für die öffentlichen Seiten, den Fan-Bereich und das Studio (async Server Component).
 * Liest den Viewer selbst: Gäste sehen „Entdecken“ plus Anmelden/Registrieren, Angemeldete zusätzlich
 * Feed, Abos und Studio (Admins auch Admin) sowie ihr Konto-Menü; Gesperrte nur „Entdecken“ und „Sperre“.
 * Klebt oben (`sticky`, `z-40`).
 */
export async function SiteHeader({ className }: { className?: string } = {}) {
  const viewer = await getViewer();
  const items = navItemsFor(viewer);

  return (
    <header className={cn("sticky top-0 z-40 border-b border-line bg-canvas", className)}>
      <Container className="flex h-16 items-center gap-4 md:gap-8">
        <Logo />
        <div className="flex h-full min-w-0 flex-1 items-center justify-end gap-2 md:justify-between md:gap-4">
          <SiteNav
            items={items}
            menuFooter={
              viewer ? undefined : (
                <>
                  <SignUpButtonLink className="h-11 w-full">Konto erstellen</SignUpButtonLink>
                  <SignInButtonLink className="h-11 w-full">Anmelden</SignInButtonLink>
                </>
              )
            }
          />
          <div className="flex shrink-0 items-center gap-2 max-md:order-first">
            {viewer ? (
              <UserMenu />
            ) : (
              <span className="hidden items-center gap-2 sm:flex">
                <SignInButtonLink />
                <SignUpButtonLink />
              </span>
            )}
          </div>
        </div>
      </Container>
    </header>
  );
}

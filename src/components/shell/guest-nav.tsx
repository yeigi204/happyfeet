import Link from "next/link";

import { SignInButtonLink, SignUpButtonLink } from "@/components/auth/auth-links";
import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/site/container";

const linkClass = "rounded-control text-[14.5px] font-semibold text-ink-muted transition-colors hover:text-ink";

/** Obere Navigation für Besucher ohne Konto (wie die Startseite der Vorschau). */
export function GuestNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/92 backdrop-blur-md">
      <Container className="flex h-16 items-center gap-3 sm:gap-5">
        {/* Unter sm nur die Bildmarke – sonst reicht die Breite (390 px) nicht für Navigation + Registrieren. */}
        <Logo className="max-sm:[&>span]:hidden" />
        <nav aria-label="Hauptnavigation" className="flex items-center gap-4 sm:gap-5">
          <Link href="/explore" className={linkClass}>
            Entdecken
          </Link>
          <Link href="/studio/become-creator" className={`${linkClass} hidden sm:inline`}>
            Für Creator
          </Link>
        </nav>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <SignInButtonLink className="max-sm:hidden" />
          <SignUpButtonLink />
        </div>
      </Container>
    </header>
  );
}

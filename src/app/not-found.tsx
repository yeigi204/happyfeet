import type { Metadata } from "next";

import { Container } from "@/components/site/container";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Seite nicht gefunden" };

/** Globale 404 (unbekannte Adressen, `notFound()` ausserhalb eigener Grenzen, z. B. /admin für Nicht-Admins). */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <SiteHeader />
      <main id="inhalt" className="flex-1">
        <Container className="grid gap-12 py-16 sm:py-24 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center">
          <div>
            <p className="eyebrow">Fehler 404</p>
            <h1 className="mt-5 font-display text-[52px] leading-[0.88] font-extrabold tracking-[-0.06em] sm:text-[88px]">
              Hier ist
              <br />
              nichts<span className="text-accent">.</span>
            </h1>
            <p className="mt-6 max-w-md text-[17px] leading-relaxed text-ink-muted">
              Diese Seite gibt es nicht – vielleicht ein Tippfehler in der Adresse, oder der Link ist veraltet.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/explore" variant="primary" size="lg">
                Creator entdecken
              </ButtonLink>
              <ButtonLink href="/" variant="secondary" size="lg">
                Zur Startseite
              </ButtonLink>
            </div>
          </div>
          {/* Marken-Motiv: fünf Zehen – eine ist nur noch gestrichelt (verloren gegangen wie diese Seite). */}
          <svg aria-hidden viewBox="0 0 34 26" className="mx-auto w-full max-w-[360px]">
            <ellipse cx="7" cy="15.5" rx="5" ry="6.4" transform="rotate(-8 7 15.5)" fill="var(--color-accent)" />
            <g fill="none" stroke="var(--color-line-strong)" strokeWidth="0.6">
              <ellipse cx="16" cy="9.4" rx="3" ry="3.4" />
              <ellipse cx="22.4" cy="8.6" rx="2.6" ry="2.9" strokeDasharray="1 1" />
              <ellipse cx="27.6" cy="10.8" rx="2.2" ry="2.5" />
              <ellipse cx="31" cy="15.4" rx="1.8" ry="2" />
            </g>
          </svg>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}

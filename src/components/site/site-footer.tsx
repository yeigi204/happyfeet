import Link from "next/link";

import { legalLinks } from "./contact";
import { Container } from "./container";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import type { ThemePreference } from "@/lib/theme";

const linkClass = "rounded-control text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline";

/**
 * Fusszeile. Rechtstexte erscheinen, sobald ihre URLs konfiguriert sind (`NEXT_PUBLIC_LEGAL_*`).
 * Mit `theme` (Gäste) zusätzlich der Darstellungs-Umschalter – Angemeldete haben ihn in Seitenleiste/oberer Leiste.
 */
export function SiteFooter({ theme }: { theme?: ThemePreference } = {}) {
  return (
    <footer className="mt-20 border-t border-line">
      <Container className="grid gap-10 py-12 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="max-w-sm">
          <Logo size="sm" />
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            Fussbilder im Abo – direkt von geprüften Creatorn aus der Schweiz. Bezahlt wird in Franken, gekündigt jederzeit
            zum Monatsende.
          </p>
        </div>
        <div className="grid gap-5 md:justify-items-end">
        <nav aria-label="Fusszeile" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/explore" className={linkClass}>
            Creator entdecken
          </Link>
          <Link href="/studio/become-creator" className={linkClass}>
            Creator werden
          </Link>
          {legalLinks().map((item) => (
            <a key={item.label} href={item.href} className={linkClass}>
              {item.label}
            </a>
          ))}
        </nav>
        {theme ? <ThemeToggle value={theme} /> : null}
        </div>
      </Container>
      <div className="border-t border-line">
        <Container className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4 text-xs font-semibold text-ink-muted">
          <span>happyfeet · Schweiz · CHF</span>
          <span className="flex items-center gap-2 text-ink-muted">
            <span className="inline-grid h-5 place-items-center rounded-full bg-surface-2 px-2 text-[11px] font-bold text-ink">
              18+
            </span>
            <span>
              <span className="sr-only">· </span>Nur für Erwachsene
            </span>
          </span>
        </Container>
      </div>
    </footer>
  );
}

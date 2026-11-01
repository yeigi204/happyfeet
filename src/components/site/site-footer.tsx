import Link from "next/link";

import { legalLinks } from "./contact";
import { Container } from "./container";
import { Wordmark } from "./wordmark";

const linkClass = "rounded-control text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline";

/** Fusszeile der öffentlichen Seiten. Rechtstexte erscheinen, sobald ihre URLs konfiguriert sind (`NEXT_PUBLIC_LEGAL_*`). */
export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <Container className="grid gap-10 py-12 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="max-w-sm">
          <Wordmark />
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            Fussbilder im Abo – direkt von geprüften Creatorn aus der Schweiz. Bezahlt wird in Franken, gekündigt jederzeit
            zum Monatsende.
          </p>
        </div>
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
      </Container>
      <div className="border-t border-line">
        <Container className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4 font-mono text-[11px] tracking-[0.12em] text-ink-faint uppercase">
          <span>happyfeet · Schweiz · CHF</span>
          <span className="flex items-center gap-2 text-ink-muted">
            <span className="inline-grid h-5 place-items-center rounded-[4px] border border-line-strong px-1 text-[10px] tracking-normal text-ink">
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

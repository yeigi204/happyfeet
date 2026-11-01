import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/site/wordmark";

/**
 * Rahmen für Anmeldung, Registrierung, Onboarding und Sperrseite.
 * Links ein redaktionelles Panel (ab lg), rechts der eigentliche Inhalt – hell, warm, viel Luft.
 * Marke wie auf den öffentlichen Seiten (`Wordmark` mit Nagel).
 */

const FACTS = [
  { label: "Zutritt", value: "ab 18 Jahren" },
  { label: "Bezahlt in", value: "Franken" },
  { label: "Abos", value: "monatlich kündbar" },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas text-ink lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col justify-between border-r border-line bg-surface px-12 py-10 lg:flex xl:px-16">
        <Wordmark />

        <div className="max-w-md">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-muted">
            Fussbilder im Abo · Schweiz
          </p>
          <p className="mt-8 font-display text-6xl leading-[0.92] font-semibold tracking-tight xl:text-7xl">
            Gepflegt.
            <br />
            Gezeigt.
            <br />
            <span className="text-accent">Abonniert.</span>
          </p>
          <p className="mt-8 max-w-sm text-base leading-relaxed text-ink-muted">
            Creator aus der Schweiz teilen ihre schönsten Bilder. Du abonnierst direkt bei ihnen – und siehst, was
            sonst verpixelt bleibt.
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-6 border-t border-line pt-6">
          {FACTS.map((fact) => (
            <div key={fact.label}>
              <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">{fact.label}</dt>
              <dd className="mt-1.5 text-sm text-ink">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </aside>

      <div className="flex min-h-dvh flex-col px-4 py-6 sm:px-8 lg:px-16 lg:py-10">
        <header className="flex items-center justify-between gap-4">
          <Wordmark className="lg:invisible" />
          <Link
            href="/explore"
            className="text-sm text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            Creator entdecken
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center py-12 sm:py-16">
          <div className="w-full max-w-md">{children}</div>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
          <span>happyfeet</span>
          <span>Nur für Erwachsene</span>
        </footer>
      </div>
    </div>
  );
}

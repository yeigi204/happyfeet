import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { getThemePreference } from "@/server/theme";

/**
 * Rahmen für Anmeldung, Registrierung, Onboarding und Sperrseite.
 * Links ein redaktionelles Panel (ab lg), rechts der eigentliche Inhalt – hell, warm, viel Luft.
 * Marke wie auf den öffentlichen Seiten (`Logo`).
 */

const FACTS = [
  { label: "Zutritt", value: "ab 18 Jahren" },
  { label: "Bezahlt in", value: "Franken" },
  { label: "Abos", value: "monatlich kündbar" },
];

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const theme = await getThemePreference();
  return (
    <div className="min-h-dvh bg-canvas text-ink lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col justify-between border-r border-line bg-surface-2 px-12 py-10 lg:flex xl:px-16">
        <Logo />

        <div className="max-w-md">
          <p className="eyebrow">Fussbilder im Abo · Schweiz</p>
          <p className="mt-8 font-display text-6xl leading-[0.95] font-extrabold tracking-[-0.045em] xl:text-7xl">
            Gepflegt.
            <br />
            Gezeigt.
            <br />
            <em className="font-medium text-accent-strong">Abonniert.</em>
          </p>
          <p className="mt-8 max-w-sm text-base leading-relaxed text-ink-muted">
            Creator aus der Schweiz teilen ihre schönsten Bilder. Du abonnierst direkt bei ihnen – und siehst, was
            sonst verpixelt bleibt.
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-6 border-t border-line pt-6">
          {FACTS.map((fact) => (
            <div key={fact.label}>
              <dt className="eyebrow">{fact.label}</dt>
              <dd className="mt-1.5 text-sm font-semibold text-ink">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </aside>

      <div className="flex min-h-dvh flex-col px-4 py-6 sm:px-8 lg:px-16 lg:py-10">
        <header className="flex items-center justify-between gap-4">
          <Logo className="lg:invisible" />
          <Link
            href="/explore"
            className="text-sm font-semibold text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            Creator entdecken
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center py-12 sm:py-16">
          <div className="w-full max-w-md">{children}</div>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-xs font-semibold text-ink-muted">
          <span>happyfeet · 18+ · Nur für Erwachsene</span>
          <ThemeToggle value={theme} />
        </footer>
      </div>
    </div>
  );
}

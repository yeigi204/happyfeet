"use client";

import { LogoMark } from "@/components/brand/logo";
import { ErrorPanel } from "@/components/site/error-panel";

/**
 * Letzte Fehlergrenze unterhalb des Root-Layouts. Fängt, was die Gruppen-Grenzen nicht können: Fehler in den Layouts
 * von (site), studio und admin (Header/Viewer, Admin-Zähler) sowie Seiten ohne eigene Grenze (/onboarding, /banned).
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <header className="mx-auto flex w-full max-w-[1240px] items-center px-4 py-5 sm:px-8">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          aria-label="happyfeet – zur Startseite"
          className="inline-flex items-center gap-2 rounded-control font-display text-[19px] leading-none font-extrabold tracking-[-0.05em] text-ink"
        >
          <LogoMark className="size-6" />
          <span aria-hidden>happyfeet</span>
        </a>
      </header>
      <main id="inhalt" className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-16 sm:px-8 sm:py-24">
        <ErrorPanel error={error} retry={retry} />
      </main>
    </div>
  );
}

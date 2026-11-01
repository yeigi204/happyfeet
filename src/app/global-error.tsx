"use client";

import { LogoMark } from "@/components/brand/logo";
import { ErrorPanel } from "@/components/site/error-panel";

import "./globals.css";

/**
 * Ersetzt das Root-Layout, wenn dieses selbst scheitert – deshalb eigenes <html>/<body> und eigener Stylesheet-Import.
 * Schriften aus dem Root-Layout fehlen hier bewusst (System-Fallbacks aus den Tokens).
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="de-CH" className="h-full antialiased">
      <body className="min-h-full bg-canvas text-ink">
        <title>Fehler · happyfeet</title>
        <div className="mx-auto w-full max-w-[1240px] px-4 py-5 sm:px-8">
          <span className="inline-flex items-center gap-2 font-display text-[19px] leading-none font-extrabold tracking-[-0.05em]">
            <LogoMark className="size-6" />
            happyfeet
          </span>
        </div>
        <main className="mx-auto w-full max-w-[1240px] px-4 py-16 sm:px-8 sm:py-24">
          <ErrorPanel error={error} retry={retry} />
        </main>
      </body>
    </html>
  );
}

"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button, buttonClasses } from "@/components/ui/button";

/** Fehler-ID (`digest`) aus einem Next-Fehler – nur sie, nie die Meldung (die kann Interna enthalten). */
function digestOf(error: unknown): string | null {
  return error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
}

/**
 * Inhalt der seitenweiten Fehlergrenzen (`app/error.tsx`, `app/global-error.tsx`): deutsche Fehlermeldung,
 * „Nochmal versuchen“ (`retry`) und ein harter Link zur Startseite (lädt neu, falls der Router selbst hängt).
 */
export function ErrorPanel({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = digestOf(error);

  return (
    <div className="max-w-2xl">
      <p className="eyebrow">Fehler</p>
      <h1 className="mt-4 font-display text-[40px] leading-[0.92] font-extrabold tracking-[-0.055em] text-ink sm:text-[60px]">
        Da ist etwas schiefgelaufen.
      </h1>
      <p className="mt-5 max-w-prose text-[15px] leading-relaxed text-ink-muted">
        Die Seite konnte nicht geladen werden. Meist hilft es, es gleich nochmal zu versuchen. Wenn der Fehler bleibt, sind wir
        schon dran.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => retry()}>
          <RotateCcw aria-hidden />
          Nochmal versuchen
        </Button>
        {/* Bewusst <a>: voller Seitenaufruf statt Client-Navigation. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className={buttonClasses({ variant: "secondary" })}>
          Zur Startseite
        </a>
      </div>
      {digest ? <p className="mt-8 font-num text-[11px] text-ink-faint">Fehler-ID: {digest}</p> : null}
    </div>
  );
}

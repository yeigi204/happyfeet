"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Container } from "@/components/site/container";
import { Button, ButtonLink } from "@/components/ui/button";

/** Fehlergrenze für alle öffentlichen Seiten – Kopf- und Fusszeile bleiben stehen. */
export default function SiteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;

  return (
    <Container className="py-16 sm:py-24">
      <div className="max-w-2xl">
        <p className="eyebrow">Fehler</p>
        <h1 className="mt-4 font-display text-[40px] leading-[0.92] font-extrabold tracking-[-0.055em] sm:text-[60px]">
          Da ist etwas schiefgelaufen.
        </h1>
        <p className="mt-5 max-w-prose text-[15px] leading-relaxed text-ink-muted">
          Die Seite konnte nicht geladen werden. Meist hilft es, es gleich nochmal zu versuchen. Wenn der Fehler bleibt, sind
          wir schon dran.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => retry()}>
            <RotateCcw aria-hidden />
            Nochmal versuchen
          </Button>
          <ButtonLink href="/" variant="secondary">
            Zur Startseite
          </ButtonLink>
        </div>
        {digest ? <p className="mt-8 font-num text-[11px] text-ink-faint">Fehler-ID: {digest}</p> : null}
      </div>
    </Container>
  );
}

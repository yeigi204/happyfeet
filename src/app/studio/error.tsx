"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Container } from "@/components/site/container";
import { Button, ButtonLink } from "@/components/ui/button";

/** Fehlergrenze für das Studio – Kopfzeile und Studio-Navigation bleiben stehen. */
export default function StudioError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;

  return (
    <Container className="py-14 sm:py-20">
      <div className="max-w-2xl">
        <p className="eyebrow">Studio · Fehler</p>
        <h1 className="mt-4 font-display text-[36px] leading-[0.95] font-extrabold tracking-[-0.05em] text-ink sm:text-[52px]">
          Das hat gerade nicht geklappt.
        </h1>
        <p className="mt-5 max-w-prose text-[15px] leading-relaxed text-ink-muted">
          Diese Ansicht konnte nicht geladen werden. Deine Posts und dein Guthaben sind davon nicht betroffen – versuch es gleich nochmal.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => retry()}>
            <RotateCcw aria-hidden />
            Nochmal versuchen
          </Button>
          <ButtonLink href="/studio" variant="secondary">
            Zur Übersicht
          </ButtonLink>
        </div>
        {digest ? <p className="mt-8 font-mono text-[11px] text-ink-faint">Fehler-ID: {digest}</p> : null}
      </div>
    </Container>
  );
}

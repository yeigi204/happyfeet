"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button, ButtonLink } from "@/components/ui/button";

/** Fehlergrenze für alle Admin-Seiten (das Layout mit Navigation bleibt stehen). */
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid max-w-2xl gap-5 rounded-card border border-line bg-surface p-6 sm:p-8">
      <p className="eyebrow">Fehler</p>
      <div>
        <h1 className="font-display text-3xl leading-none font-bold tracking-[-0.04em] text-ink">Diese Ansicht hat sich verschluckt.</h1>
        <p className="mt-3 text-[15px] text-ink-muted">
          Die Daten konnten nicht geladen werden. Meist hilft ein zweiter Versuch – wenn nicht, liegt es an der Verbindung zur Datenbank.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => retry()}>
          <RotateCcw aria-hidden />
          Nochmals versuchen
        </Button>
        <ButtonLink href="/admin" variant="ghost" size="sm">
          Zum Dashboard
        </ButtonLink>
      </div>
      {digest ? <p className="font-mono text-[11px] text-ink-faint">Fehler-ID {digest}</p> : null}
    </div>
  );
}

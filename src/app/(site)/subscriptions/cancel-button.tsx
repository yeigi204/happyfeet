"use client";

import { useActionState, useEffect, useId, useRef, type MouseEvent } from "react";

import { Button } from "@/components/ui/button";

import type { CancelState } from "./actions";

/**
 * „Kündigen“ mit Bestätigungsdialog (natives `<dialog>`: Fokusfalle, Escape, Fokus-Rückgabe).
 * Die Server Action ist mit der Abo-ID gebunden; nach Erfolg schliesst der Dialog und die Seite
 * zeigt das Abo als „Gekündigt“.
 */
export function CancelSubscriptionButton({
  action,
  creatorName,
  accessUntil,
}: {
  action: (state: CancelState, formData: FormData) => Promise<CancelState>;
  creatorName: string;
  /** Bereits formatiertes Datum, bis zu dem der Zugang bleibt. */
  accessUntil: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(action, null);
  const titleId = useId();

  useEffect(() => {
    if (state?.ok) dialog.current?.close();
  }, [state]);

  const close = () => dialog.current?.close();
  const onBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget && !pending) close();
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => dialog.current?.showModal()}>
        Kündigen
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClick={onBackdropClick}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] max-w-none rounded-card border border-line bg-surface p-0 text-ink backdrop:bg-ink/45 open:animate-rise"
      >
        <form action={formAction} className="grid gap-4 p-5">
          <h2 id={titleId} className="font-display text-xl leading-tight font-bold tracking-[-0.03em]">
            Abo bei {creatorName} kündigen?
          </h2>
          <p className="text-sm leading-relaxed text-ink-muted">
            Das Abo verlängert sich nicht mehr. Du hast schon bis zum{" "}
            <span className="font-mono text-ink">{accessUntil}</span> bezahlt – bis dahin bleiben alle Posts für dich sichtbar.
          </p>
          {state && !state.ok ? (
            <p role="alert" className="rounded-control border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-ink">
              {state.error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={close} disabled={pending}>
              Abo behalten
            </Button>
            <Button type="submit" variant="danger" disabled={pending} aria-busy={pending || undefined}>
              {pending ? "Wird gekündigt …" : "Ja, kündigen"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

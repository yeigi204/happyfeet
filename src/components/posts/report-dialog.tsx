"use client";

import { Check, Flag, X } from "lucide-react";
import { useActionState, useRef, type MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { REPORT_DETAILS_MAX_LENGTH, REPORT_REASONS } from "@/lib/domain/reports";
import type { ReportReason } from "@/lib/domain/types";
import type { ActionResult } from "@/server/errors";

export type ReportState = ActionResult<{ reportId: string }> | null;
export type ReportAction = (state: ReportState, formData: FormData) => Promise<ReportState>;

const DETAILS_MAX_LENGTH = REPORT_DETAILS_MAX_LENGTH;

const REASONS = Object.entries(REPORT_REASONS) as [ReportReason, (typeof REPORT_REASONS)[ReportReason]][];

/**
 * „Melden“-Knopf mit modalem Dialog (natives `<dialog>`: Fokusfalle, Escape, Fokus-Rückgabe inklusive).
 * Grund aus `REPORT_REASONS`, optionale Details; Ergebnis via Server Action (`reportPost`).
 */
export function ReportDialog({ postId, action, creatorName }: { postId: string; action: ReportAction; creatorName: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(action, null);
  const done = state?.ok === true;
  const titleId = `report-title-${postId}`;

  const close = () => dialog.current?.close();
  const onBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) close();
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => dialog.current?.showModal()} className="-mr-2">
        <Flag aria-hidden />
        {done ? "Gemeldet" : "Melden"}
      </Button>

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClick={onBackdropClick}
        className="m-auto w-[min(34rem,calc(100vw-2rem))] max-w-none rounded-card border border-line bg-surface p-0 text-ink backdrop:bg-ink/45 open:animate-rise"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 id={titleId} className="font-display text-xl leading-tight font-bold tracking-[-0.03em]">
              {done ? "Danke für deine Meldung" : "Post melden"}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {done
                ? "Wir schauen uns den Post an und entscheiden so schnell wie möglich."
                : `Was stimmt mit diesem Post von ${creatorName} nicht? ${creatorName} erfährt nicht, wer gemeldet hat.`}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="-mt-1 -mr-2 grid size-9 shrink-0 place-items-center rounded-control text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X aria-hidden className="size-4" />
            <span className="sr-only">Dialog schliessen</span>
          </button>
        </div>

        {done ? (
          <div className="flex items-center justify-between gap-4 px-5 py-5">
            <p className="flex items-center gap-2 text-sm text-ink">
              <span aria-hidden className="grid size-6 place-items-center rounded-full bg-success/15 text-success">
                <Check className="size-3.5" />
              </span>
              Meldung eingegangen
            </p>
            <Button variant="secondary" size="sm" onClick={close}>
              Schliessen
            </Button>
          </div>
        ) : (
          <form action={formAction} className="grid gap-4 px-5 py-5">
            <input type="hidden" name="postId" value={postId} />
            <Field label="Grund" error={state && !state.ok ? state.fieldErrors?.reason?.[0] : undefined}>
              <Select name="reason" required defaultValue="">
                <option value="" disabled>
                  Bitte wählen …
                </option>
                {REASONS.map(([value, reason]) => (
                  <option key={value} value={value}>
                    {reason.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Details (freiwillig)"
              hint="Hilft uns bei der Prüfung, z. B. woher du das Bild kennst."
              error={state && !state.ok ? state.fieldErrors?.details?.[0] : undefined}
            >
              <Textarea name="details" rows={3} maxLength={DETAILS_MAX_LENGTH} />
            </Field>

            {state && !state.ok && !state.fieldErrors?.reason && !state.fieldErrors?.details ? (
              <p role="alert" className="rounded-control border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-ink">
                {state.error}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              <Button variant="ghost" onClick={close}>
                Abbrechen
              </Button>
              <Button type="submit" variant="primary" disabled={pending} aria-busy={pending || undefined}>
                {pending ? "Wird gesendet …" : "Meldung senden"}
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}

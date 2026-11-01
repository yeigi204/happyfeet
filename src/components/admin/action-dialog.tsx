"use client";

import { LoaderCircle, OctagonAlert } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field } from "@/components/ui/field";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/server/errors";

import { settleAction } from "./lib/settle-action";

export type ActionDialogNote = {
  label: string;
  placeholder?: string;
  hint?: ReactNode;
  required?: boolean;
  /** Schlüssel in `fieldErrors` der Server Action (Standard: `note`). */
  field?: string;
  maxLength?: number;
  /** Vorbelegung (z. B. Textbaustein). */
  defaultValue?: string;
};

export type ActionDialogProps = {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  /** Mit Notizfeld (Grund, Begründung) – ohne ist es eine reine Bestätigung. */
  note?: ActionDialogNote;
  /**
   * Gibt ein `ActionResult` zurück → der Dialog wartet und zeigt Fehler am Feld.
   * Gibt nichts zurück → der Dialog schliesst sofort (optimistische Aktion des Aufrufers).
   */
  onConfirm: (note: string) => Promise<ActionResult<unknown>> | void;
  onClose: () => void;
  /** Nach erfolgreichem Abschluss (vor `onClose`). */
  onDone?: () => void;
};

const REQUIRED_MESSAGE = "Bitte gib eine Begründung an – sie wird gespeichert und ist für das Team nachvollziehbar.";

/**
 * Modaler Bestätigungs-/Notiz-Dialog (natives `<dialog>`: Fokusfalle, Esc, Hintergrund inert).
 * Nur rendern, solange er offen sein soll – jeder Aufruf startet mit leerem Zustand.
 * `⌘↵` / `Ctrl↵` sendet aus dem Notizfeld ab.
 */
export function ActionDialog({ title, description, confirmLabel, tone = "primary", note, onConfirm, onClose, onDone }: ActionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [value, setValue] = useState(note?.defaultValue ?? "");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // Mit Notizfeld dorthin; reine Bestätigungen (oft unumkehrbar, z. B. „Als bezahlt markieren“) starten auf
    // „Abbrechen“ – ein doppeltes Enter darf nichts auslösen.
    (dialog.querySelector("textarea") ?? dialog.querySelector<HTMLButtonElement>("button[data-dialog-cancel]"))?.focus();
    // Kein `close()` im Cleanup: das Entfernen aus dem DOM beendet den Modal-Zustand ohnehin, und ein
    // `close`-Event aus dem StrictMode-Probelauf würde den eben geöffneten Dialog sofort wieder schliessen.
  }, []);

  // Die UI-Primitives reichen keine Refs durch – Fokus daher über das Dialog-Element.
  const focusNote = () => dialogRef.current?.querySelector("textarea")?.focus();

  const finish = () => {
    onDone?.();
    onClose();
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (pending) return;
    const text = value.trim();
    if (note?.required && text.length === 0) {
      setFieldError(REQUIRED_MESSAGE);
      focusNote();
      return;
    }
    setFieldError(null);
    setFormError(null);
    const outcome = onConfirm(text);
    if (!outcome) {
      finish();
      return;
    }
    startTransition(async () => {
      const result = await settleAction(outcome);
      if (result.ok) {
        finish();
        return;
      }
      const message = result.fieldErrors?.[note?.field ?? "note"]?.[0];
      if (message && note) {
        setFieldError(message);
        focusNote();
      } else {
        setFormError(result.error);
      }
    });
  };

  const onTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };

  const hasBody = Boolean(note || formError);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      // Esc während des Speicherns nicht schliessen (wie „Abbrechen“) – sonst gingen Ergebnis und Bestätigung verloren.
      onCancel={(e) => pending && e.preventDefault()}
      onClick={(e) => e.target === e.currentTarget && !pending && onClose()}
      className={cn(
        // Text-Ausrichtung/-Umbruch zurücksetzen: der Dialog sitzt im DOM oft in einer Tabellenzelle (erbt sonst „text-right“).
        "m-0 mx-auto mt-[14vh] w-[min(520px,calc(100vw-32px))] max-w-none rounded-card border border-line-strong bg-surface p-0 text-left font-normal whitespace-normal text-ink outline-none",
        "backdrop:bg-[rgb(8_6_5/0.74)] open:animate-rise",
      )}
    >
      <form onSubmit={submit} noValidate>
        <div className="border-b border-line px-5 pt-5 pb-4">
          <h2 id={titleId} className="font-display text-xl leading-tight font-bold tracking-[-0.03em]">
            {title}
          </h2>
          {description ? (
            <div id={descriptionId} className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
              {description}
            </div>
          ) : null}
        </div>

        {hasBody ? (
          <div className="grid gap-4 px-5 py-5">
            {note ? (
              <Field label={note.label} hint={note.hint} error={fieldError ?? undefined}>
                <Textarea
                  name={note.field ?? "note"}
                  rows={3}
                  value={value}
                  maxLength={note.maxLength ?? 1000}
                  required={note.required}
                  placeholder={note.placeholder}
                  onChange={(e) => {
                    setValue(e.target.value);
                    if (fieldError) setFieldError(null);
                  }}
                  onKeyDown={onTextareaKeyDown}
                />
              </Field>
            ) : null}
            {formError ? (
              <p role="alert" className="flex items-start gap-2 rounded-control border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px] text-ink">
                <OctagonAlert aria-hidden className="mt-px size-4 shrink-0 text-danger" />
                {formError}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className={cn("flex flex-wrap items-center justify-end gap-2 px-5 py-3.5", hasBody && "border-t border-line")}>
          {note ? (
            <span aria-hidden className="mr-auto hidden items-center gap-1 font-mono text-[11px] text-ink-faint sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd> senden
            </span>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending} data-dialog-cancel>
            Abbrechen
          </Button>
          <Button type="submit" variant={tone === "danger" ? "danger" : "primary"} size="sm" disabled={pending}>
            {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";

import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import type { ActionResult } from "@/server/errors";

export type ConfirmState = ActionResult<void> | null;

export type ConfirmActionButtonProps = {
  /** Server Action (ggf. mit Ziel-ID gebunden). */
  action: (state: ConfirmState, formData: FormData) => Promise<ConfirmState>;
  trigger: ReactNode;
  /** Zugänglicher Name des Auslösers, wenn `trigger` nur ein Icon ist oder Kontext fehlt. */
  triggerLabel?: string;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  triggerClassName?: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  cancelLabel: string;
};

/**
 * Knopf mit Bestätigungsdialog (natives `<dialog>`: Fokusfalle, Escape, Fokus-Rückgabe an den Auslöser).
 * Nach Erfolg schliesst der Dialog; Fehler erscheinen im Dialog.
 */
export function ConfirmActionButton({
  action,
  trigger,
  triggerLabel,
  triggerVariant = "ghost",
  triggerSize = "sm",
  triggerClassName,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel,
}: ConfirmActionButtonProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(action, null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (state?.ok) dialog.current?.close();
  }, [state]);

  const close = () => dialog.current?.close();
  const onBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget && !pending) close();
  };

  return (
    <>
      <Button
        variant={triggerVariant}
        size={triggerSize}
        className={triggerClassName}
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        {trigger}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={onBackdropClick}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] max-w-none rounded-card border border-line bg-surface p-0 text-ink backdrop:bg-ink/45 open:animate-rise"
      >
        <form action={formAction} className="grid gap-4 p-5">
          <h2 id={titleId} className="font-display text-xl leading-tight font-bold tracking-[-0.03em]">
            {title}
          </h2>
          <div id={descriptionId} className="text-sm leading-relaxed text-ink-muted">
            {description}
          </div>
          {state && !state.ok ? (
            <p role="alert" className="rounded-control border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-ink">
              {state.error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={close} disabled={pending}>
              {cancelLabel}
            </Button>
            <Button type="submit" variant="danger" disabled={pending} aria-busy={pending || undefined}>
              {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
              {pending ? pendingLabel : confirmLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

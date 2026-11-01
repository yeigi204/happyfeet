"use client";

import { useActionState } from "react";

import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import type { ActionResult } from "@/server/errors";

export type SubscribeState = ActionResult<null> | null;
export type SubscribeAction = (state: SubscribeState, formData: FormData) => Promise<SubscribeState>;

/**
 * Startet den Abo-Checkout. Die Server Action (mit gebundener Creator-ID) leitet bei Erfolg zum
 * Zahlungsanbieter weiter; nur Fehler kommen hierher zurück.
 */
export function SubscribeButton({
  action,
  children,
  variant = "primary",
  size = "md",
  className,
  block,
}: {
  action: SubscribeAction;
  children: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  /** Volle Breite. */
  block?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className={cn("grid gap-2", block ? "w-full" : "justify-items-center", className)}>
      <Button type="submit" variant={variant} size={size} disabled={pending} aria-busy={pending || undefined} className={block ? "w-full" : undefined}>
        {pending ? "Einen Moment …" : children}
      </Button>
      {state && !state.ok ? (
        <p role="alert" className="flex items-start gap-1.5 text-xs font-medium text-danger">
          <span aria-hidden className="mt-1 inline-block size-1.5 shrink-0 rounded-full bg-danger" />
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

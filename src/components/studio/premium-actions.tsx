"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/errors";

type PremiumState = ActionResult<void> | null;

/** „Premium buchen“: startet den Checkout (Server Action leitet weiter); Fehler erscheinen darunter. */
export function UpgradeButton({ action, label }: { action: (state: PremiumState, formData: FormData) => Promise<PremiumState>; label: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="grid gap-2">
      <Button type="submit" variant="primary" size="lg" disabled={pending} aria-busy={pending || undefined} className="w-full sm:w-auto sm:justify-self-start">
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
        {pending ? "Weiter zur Zahlung …" : label}
        {!pending ? <ArrowRight aria-hidden /> : null}
      </Button>
      {state && !state.ok ? (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2.5 text-sm text-ink">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

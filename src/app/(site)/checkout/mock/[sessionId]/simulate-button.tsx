"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import type { SimulateState } from "./actions";

/** Absende-Knopf der Testzahlung; bei Erfolg leitet die Server Action weiter, Fehler erscheinen darunter. */
export function SimulateButton({
  action,
  children,
}: {
  action: (state: SimulateState, formData: FormData) => Promise<SimulateState>;
  children: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="grid gap-3">
      <Button type="submit" variant="primary" size="lg" disabled={pending} aria-busy={pending || undefined} className="w-full">
        {pending ? "Zahlung wird simuliert …" : children}
      </Button>
      {state && !state.ok ? (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2.5 text-sm text-ink">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

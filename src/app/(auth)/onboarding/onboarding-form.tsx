"use client";

import { ArrowRight, Check, LoaderCircle, X } from "lucide-react";
import { useActionState, useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { normalizeHandle, validateHandle } from "@/lib/domain/handles";

import { checkHandleAvailability, submitOnboarding, type HandleCheck, type OnboardingFormState } from "./actions";

const initialState: OnboardingFormState = {};

type Availability = { status: "idle" } | { status: "checking"; handle: string } | HandleCheck;

/** Entprellte Live-Prüfung des Handles. Format wird lokal geprüft, Verfügbarkeit auf dem Server. */
function useHandleAvailability(raw: string): Availability {
  const handle = normalizeHandle(raw);
  const local = handle.length >= 3 ? validateHandle(handle) : null;
  const shouldAsk = local?.ok === true;
  const [answer, setAnswer] = useState<{ handle: string; result: HandleCheck } | null>(null);

  useEffect(() => {
    if (!shouldAsk) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      checkHandleAvailability(handle)
        .then((result) => {
          if (!cancelled) setAnswer({ handle, result });
        })
        .catch(() => {
          // Netzwerkfehler: still bleiben, der Server prüft beim Absenden ohnehin.
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle, shouldAsk]);

  if (!local) return { status: "idle" };
  if (!local.ok) return { status: "invalid", reason: local.reason };
  if (!answer || answer.handle !== handle) return { status: "checking", handle };
  return answer.result;
}

// Fokus: der globale 2px-Akzentrahmen (`:focus-visible` in globals.css) – nicht unterdrücken.
const inputBase =
  "block w-full rounded-control border bg-surface px-3.5 py-3 text-base text-ink placeholder:text-ink-faint transition-colors";

function borderFor(error: string | undefined): string {
  return error ? "border-danger" : "border-line hover:border-line-strong";
}

function FieldShell({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="mt-2">{children}</div>
      <div id={`${id}-message`} className="mt-2 min-h-5 text-sm" aria-live="polite">
        {error ? (
          <p className="flex items-start gap-1.5 text-danger">
            <X aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : (
          hint
        )}
      </div>
    </div>
  );
}

function HandleStatus({ availability }: { availability: Availability }) {
  switch (availability.status) {
    case "idle":
      return <p className="text-ink-muted">3–24 Zeichen: a–z, 0–9 und _</p>;
    case "checking":
      return (
        <p className="flex items-center gap-1.5 text-ink-muted">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          Prüfe <span className="font-mono">@{availability.handle}</span> …
        </p>
      );
    case "available":
      return (
        <p className="flex items-center gap-1.5 text-success">
          <Check aria-hidden className="size-4" />
          <span>
            <span className="font-mono">@{availability.handle}</span> ist frei
          </span>
        </p>
      );
    case "taken":
      return (
        <p className="flex items-center gap-1.5 text-danger">
          <X aria-hidden className="size-4" />
          <span>
            <span className="font-mono">@{availability.handle}</span> ist schon vergeben
          </span>
        </p>
      );
    case "invalid":
      return (
        <p className="flex items-center gap-1.5 text-danger">
          <X aria-hidden className="size-4" />
          {availability.reason}
        </p>
      );
  }
}

export function OnboardingForm({ maxBirthDate }: { maxBirthDate: string }) {
  const [state, formAction, pending] = useActionState(submitOnboarding, initialState);
  const [handleInput, setHandleInput] = useState(state.values?.handle ?? "");
  // Server-Fehler zum Handle gilt nur, bis der Handle wieder bearbeitet wird – danach zählt die Live-Prüfung.
  const [handleEditedFor, setHandleEditedFor] = useState<OnboardingFormState | null>(null);
  const availability = useHandleAvailability(handleInput);

  const errors = {
    handle: state.fieldErrors?.handle?.[0],
    displayName: state.fieldErrors?.displayName?.[0],
    birthDate: state.fieldErrors?.birthDate?.[0],
    confirmAdult: state.fieldErrors?.confirmAdult?.[0],
  };
  const handleError = handleEditedFor === state ? undefined : errors.handle;

  return (
    <form action={formAction} noValidate className="space-y-7">
      <FieldShell id="handle" label="Handle" error={handleError} hint={<HandleStatus availability={availability} />}>
        <div
          className={`flex items-center rounded-control border bg-surface transition-colors has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent ${borderFor(handleError)}`}
        >
          <span aria-hidden className="pl-3.5 font-mono text-base text-ink-muted select-none">
            @
          </span>
          <input
            id="handle"
            name="handle"
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={25}
            placeholder="dein_handle"
            defaultValue={state.values?.handle}
            onChange={(e) => {
              setHandleInput(e.target.value);
              setHandleEditedFor(state);
            }}
            aria-invalid={handleError ? true : undefined}
            aria-describedby="handle-message"
            // Fokusrahmen sitzt am umgebenden Feld (inkl. „@“), daher hier keiner.
            className="block w-full rounded-control bg-transparent py-3 pr-3.5 pl-1 font-mono text-base text-ink placeholder:text-ink-faint focus-visible:outline-none"
          />
        </div>
      </FieldShell>

      <FieldShell
        id="displayName"
        label="Anzeigename"
        error={errors.displayName}
        hint={<p className="text-ink-muted">So erscheinst du auf deinem Profil. 2–40 Zeichen.</p>}
      >
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          autoComplete="nickname"
          maxLength={40}
          placeholder="z. B. Lena aus Bern"
          defaultValue={state.values?.displayName}
          aria-invalid={errors.displayName ? true : undefined}
          aria-describedby="displayName-message"
          className={`${inputBase} ${borderFor(errors.displayName)}`}
        />
      </FieldShell>

      <FieldShell
        id="birthDate"
        label="Geburtsdatum"
        error={errors.birthDate}
        hint={<p className="text-ink-muted">Wird nie öffentlich angezeigt.</p>}
      >
        <input
          id="birthDate"
          name="birthDate"
          type="date"
          required
          autoComplete="bday"
          min="1900-01-01"
          max={maxBirthDate}
          defaultValue={state.values?.birthDate}
          aria-invalid={errors.birthDate ? true : undefined}
          aria-describedby="birthDate-message"
          className={`${inputBase} font-mono tabular-nums ${borderFor(errors.birthDate)}`}
        />
      </FieldShell>

      <div>
        <label
          htmlFor="confirmAdult"
          className={`flex cursor-pointer items-start gap-3 rounded-control border bg-surface px-4 py-3.5 transition-colors ${borderFor(errors.confirmAdult)}`}
        >
          <input
            id="confirmAdult"
            name="confirmAdult"
            type="checkbox"
            required
            defaultChecked={state.values?.confirmAdult}
            aria-invalid={errors.confirmAdult ? true : undefined}
            aria-describedby="confirmAdult-message"
            className="mt-0.5 size-5 shrink-0 cursor-pointer accent-accent"
          />
          <span className="text-sm leading-relaxed text-ink">
            Ich bin mindestens 18 Jahre alt
            <span className="block text-ink-muted">Falsche Angaben führen zur Sperre deines Kontos.</span>
          </span>
        </label>
        <div id="confirmAdult-message" className="mt-2 min-h-5 text-sm" aria-live="polite">
          {errors.confirmAdult && (
            <p className="flex items-start gap-1.5 text-danger">
              <X aria-hidden className="mt-0.5 size-4 shrink-0" />
              {errors.confirmAdult}
            </p>
          )}
        </div>
      </div>

      {state.error && !state.fieldErrors && (
        <p role="alert" className="border-l-2 border-danger pl-3 text-sm text-danger">
          {state.error}
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" disabled={pending} aria-busy={pending || undefined} className="group w-full">
        {pending ? (
          <>
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            Wird gespeichert …
          </>
        ) : (
          <>
            Profil anlegen
            <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </Button>
    </form>
  );
}

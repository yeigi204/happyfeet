import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

import { cn } from "./cn";

type ControlProps = { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false" };

export type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Label + Control + Hinweis/Fehler. Das (einzige) Kind-Element bekommt `id`, `aria-describedby`
 * und bei Fehler `aria-invalid` – damit ist jedes Feld ohne Zusatzaufwand barrierefrei verknüpft.
 */
export function Field({ label, hint, error, children, className }: FieldProps) {
  const autoId = useId();
  const child = isValidElement<ControlProps>(children) ? (children as ReactElement<ControlProps>) : null;
  const controlId = child?.props.id ?? `field-${autoId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [child?.props["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = child
    ? cloneElement(child, {
        id: controlId,
        "aria-describedby": describedBy,
        ...(error ? { "aria-invalid": true } : {}),
      })
    : children;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={controlId} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      {control}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      {hint && error ? (
        <p id={hintId} className="sr-only">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-xs font-semibold text-danger">
          <span aria-hidden className="inline-block size-1.5 rounded-full bg-danger" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

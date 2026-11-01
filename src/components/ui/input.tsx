import type { ComponentPropsWithoutRef } from "react";

import { cn } from "./cn";

/**
 * Gemeinsame Optik für Formular-Controls (Input, Textarea, Select).
 * Fokus: Rahmen in `focus` + weicher Ring in `surface-2`; Fehler: Rahmen `danger` + Ring `danger-soft` –
 * so sieht ein fokussiertes Feld nie wie ein Fehlerfeld aus.
 */
export const controlClasses =
  "w-full rounded-control border border-line-strong bg-surface text-[15px] text-ink placeholder:text-ink-faint " +
  "transition-[border-color,box-shadow] duration-100 hover:border-ink-faint " +
  "focus-visible:border-focus focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-surface-2 " +
  "aria-invalid:border-danger aria-invalid:ring-4 aria-invalid:ring-danger-soft " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export type InputProps = ComponentPropsWithoutRef<"input">;

export function Input({ className, type = "text", ...props }: InputProps) {
  return <input type={type} className={cn(controlClasses, "h-11 px-3.5", className)} {...props} />;
}

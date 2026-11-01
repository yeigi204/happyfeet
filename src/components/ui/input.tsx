import type { ComponentPropsWithoutRef } from "react";

import { cn } from "./cn";

/** Gemeinsame Optik für Formular-Controls (Input, Textarea, Select). */
export const controlClasses =
  "w-full rounded-control border border-line-strong bg-surface text-sm text-ink placeholder:text-ink-faint " +
  "transition-[border-color] duration-100 hover:border-ink-faint " +
  "focus-visible:border-accent focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent " +
  "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export type InputProps = ComponentPropsWithoutRef<"input">;

export function Input({ className, type = "text", ...props }: InputProps) {
  return <input type={type} className={cn(controlClasses, "h-10 px-3", className)} {...props} />;
}

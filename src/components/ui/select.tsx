import { ChevronDown } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "./cn";
import { controlClasses } from "./input";

export type SelectProps = ComponentPropsWithoutRef<"select">;

/** Natives Select (Tastatur, Mobile-Picker, Formulare ohne JS) mit eigenem Pfeil. */
export function Select({ className, children, ...props }: SelectProps) {
  return (
    <span className={cn("relative block", className)}>
      <select className={cn(controlClasses, "h-10 cursor-pointer appearance-none pr-9 pl-3")} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-faint" />
    </span>
  );
}

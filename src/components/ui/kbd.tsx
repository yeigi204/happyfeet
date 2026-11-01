import type { ComponentPropsWithoutRef } from "react";

import { cn } from "./cn";

export function Kbd({ className, ...props }: ComponentPropsWithoutRef<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line-strong bg-surface px-1.5",
        "font-num text-[11px] leading-none font-bold text-ink-muted uppercase",
        className,
      )}
      {...props}
    />
  );
}

import type { ComponentPropsWithoutRef } from "react";

import { cn } from "./cn";

export function Kbd({ className, ...props }: ComponentPropsWithoutRef<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-b-2 border-line-strong bg-surface-2 px-1",
        "font-mono text-[10.5px] leading-none font-medium text-ink-muted uppercase",
        className,
      )}
      {...props}
    />
  );
}

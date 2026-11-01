import Link from "next/link";

import { cn } from "@/components/ui/cn";

/** Marken-Zeichen: ein lackierter Zehennagel. */
export function NailMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("block h-[15px] w-3 shrink-0 rounded-[50%_50%_42%_42%/62%_62%_38%_38%] bg-accent", className)}
    />
  );
}

/** Logo-Schriftzug „happyfeet“ mit Nagel – verlinkt auf die Startseite. */
export function Wordmark({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      aria-label="happyfeet – zur Startseite"
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-control font-display text-[19px] leading-none font-extrabold tracking-[-0.05em] text-ink",
        className,
      )}
    >
      <NailMark />
      <span aria-hidden>happyfeet</span>
    </Link>
  );
}

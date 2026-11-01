import Link from "next/link";

import { cn } from "@/components/ui/cn";

/**
 * Bildmarke: beerenrotes, abgerundetes Quadrat mit stilisiertem Fussabdruck (drei Zehen + Ballen).
 * Farben über Tokens – folgt Hell und Dunkel. Rein dekorativ (`aria-hidden`).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 30" aria-hidden="true" focusable="false" className={cn("size-[30px] shrink-0", className)}>
      <rect width="30" height="30" rx="10" fill="var(--color-accent)" />
      <g fill="var(--color-accent-ink)">
        <circle cx="11" cy="10" r="3" />
        <circle cx="18" cy="9" r="3" />
        <circle cx="24" cy="12" r="2" />
        <ellipse cx="15.5" cy="19" rx="6.5" ry="5" />
      </g>
    </svg>
  );
}

const SIZES = {
  sm: { mark: "size-[26px]", text: "text-[17px]" },
  md: { mark: "size-[30px]", text: "text-[19px]" },
} as const;

/**
 * Logo „happyfeet“. Mit `href` (Standard „/“) ein Link, mit `href={null}` nur ein Bild bzw. Schriftzug.
 */
export function Logo({
  href = "/",
  size = "md",
  withWordmark = true,
  className,
}: {
  href?: string | null;
  size?: "sm" | "md";
  withWordmark?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  const content = (
    <>
      <LogoMark className={s.mark} />
      {withWordmark ? (
        <span aria-hidden={href ? true : undefined} className={cn("font-display leading-none font-extrabold tracking-[-0.03em] text-ink", s.text)}>
          happyfeet
        </span>
      ) : null}
    </>
  );
  const base = cn("inline-flex shrink-0 items-center gap-2.5", className);

  if (href) {
    return (
      <Link href={href} aria-label="happyfeet – zur Startseite" className={cn(base, "rounded-control")}>
        {content}
      </Link>
    );
  }
  return withWordmark ? (
    <span className={base}>{content}</span>
  ) : (
    <span role="img" aria-label="happyfeet" className={base}>
      {content}
    </span>
  );
}

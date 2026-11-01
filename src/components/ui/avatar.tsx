import { cn } from "./cn";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZES: Record<AvatarSize, string> = {
  xs: "size-5 text-[9px]",
  sm: "size-7 text-[11px]",
  md: "size-9 text-[13px]",
  lg: "size-12 text-base",
  xl: "size-18 text-2xl",
};

// Warme Token-Flächen statt zufälliger Farben – deterministisch pro Name.
const FILLS = ["bg-surface-2", "bg-accent-soft", "bg-premium-soft"] as const;

function initials(name: string): string {
  const parts = name
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({ name, src, size = "md", className }: { name: string; src?: string | null; size?: AvatarSize; className?: string }) {
  const box = cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line", SIZES[size], className);
  if (src) {
    return (
      <span className={box}>
        {/* Signierte, kurzlebige URLs – next/image würde sie cachen/umschreiben. */}
        <img src={src} alt={name} className="size-full object-cover" />
      </span>
    );
  }
  return (
    <span className={cn(box, FILLS[hash(name) % FILLS.length], "font-display font-bold tracking-tight text-ink")} role="img" aria-label={name}>
      <span aria-hidden>{initials(name) || "?"}</span>
    </span>
  );
}

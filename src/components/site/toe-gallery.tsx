import Link from "next/link";

import { initials } from "@/components/ui/avatar";
import { cn } from "@/components/ui/cn";
import type { CreatorCard } from "@/server/services/creators";

/**
 * Das Marken-Motiv (fünf Zehen, der grosse lackiert – siehe EmptyState) als Bildstrecke:
 * jede Zehe zeigt den Avatar eines echten Creators und verlinkt aufs Profil.
 * Geometrie aus dem Motiv (viewBox 34 × 20), in Prozent der Fläche.
 */
const TOES = [
  { left: 5.88, top: 25.5, width: 29.4, height: 64, rotate: -8 },
  { left: 38.2, top: 10, width: 17.6, height: 34, rotate: -4 },
  { left: 58.2, top: 8.5, width: 15.3, height: 29, rotate: 2 },
  { left: 74.7, top: 21.5, width: 12.9, height: 25, rotate: 8 },
  { left: 85.9, top: 47, width: 10.6, height: 20, rotate: 14 },
] as const;

export function ToeGallery({ creators, className }: { creators: CreatorCard[]; className?: string }) {
  return (
    <div className={cn("relative aspect-[34/20] w-full", className)}>
      {/* Fussballen unter den Zehen – wird vom umgebenden Rahmen unten abgeschnitten. */}
      <span aria-hidden className="absolute top-[42%] -right-[3%] -left-[3%] h-[130%] rounded-[50%/34%] border border-line bg-surface-2" />
      {TOES.map((toe, i) => {
        const creator = creators[i];
        const style = {
          left: `${toe.left}%`,
          top: `${toe.top}%`,
          width: `${toe.width}%`,
          height: `${toe.height}%`,
          transform: `rotate(${toe.rotate}deg)`,
        };
        const big = i === 0;
        if (!creator) {
          return (
            <span
              key={i}
              aria-hidden
              style={style}
              className={cn("absolute rounded-[50%]", big ? "bg-accent" : "border-2 border-ink-faint/60")}
            />
          );
        }
        return (
          <Link
            key={creator.userId}
            href={`/c/${creator.handle}`}
            style={style}
            title={`${creator.displayName} (@${creator.handle})`}
            className={cn(
              "group absolute overflow-hidden rounded-[50%] bg-surface-2 transition-transform duration-200 hover:scale-[1.04] focus-visible:scale-[1.04]",
              big
                ? "shadow-[0_0_0_4px_var(--color-canvas),0_0_0_9px_var(--color-accent)]"
                : "shadow-[0_0_0_3px_var(--color-canvas),0_0_0_4px_var(--color-line-strong)] hover:shadow-[0_0_0_3px_var(--color-canvas),0_0_0_5px_var(--color-accent)]",
            )}
          >
            {creator.avatarUrl ? (
              <img
                src={creator.avatarUrl}
                alt={`${creator.displayName} – Profil ansehen`}
                loading="eager"
                decoding="async"
                className="size-full object-cover"
              />
            ) : (
              <span className="grid size-full place-items-center font-display text-xl font-bold text-ink">
                {initials(creator.displayName, 1) || "?"}
                <span className="sr-only">{creator.displayName}</span>
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

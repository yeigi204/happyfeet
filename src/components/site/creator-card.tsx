import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/components/ui/cn";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { formatChf, formatNumber } from "@/lib/format";
import type { CreatorCard as CreatorCardData } from "@/server/services/creators";

import { countLabel } from "./text";

/**
 * Karte eines Creators (Explore, Landing). Die ganze Karte ist ein Link aufs Profil. Enthält nie Post-Medien.
 * Oben ein ruhiges Band (Marke, kein Bild – die Karten-Daten enthalten bewusst kein Titelbild), darüber der Avatar mit Ring.
 */
export function CreatorCard({ creator, className }: { creator: CreatorCardData; className?: string }) {
  return (
    <Link
      href={`/c/${creator.handle}`}
      className={cn(
        "group flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sm transition-shadow duration-150 hover:shadow-md",
        className,
      )}
    >
      <div aria-hidden className="h-20 bg-[linear-gradient(135deg,var(--color-surface-2),var(--color-accent-soft))]" />
      <div className="flex flex-1 flex-col px-5 pb-5">
        <div className="-mt-9 flex items-end justify-between gap-3">
          <Avatar ring name={creator.displayName} src={creator.avatarUrl} size="xl" />
          {creator.isPremium ? <PremiumBadge /> : null}
        </div>

        <h3 className="mt-3 truncate font-display text-lg leading-tight font-extrabold tracking-[-0.02em] text-ink">{creator.displayName}</h3>
        <p className="mt-0.5 truncate text-[13px] text-ink-muted">@{creator.handle}</p>
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed wrap-anywhere text-ink-muted">
          {creator.bio || "Hat noch keine Bio geschrieben – die Bilder sprechen für sich."}
        </p>

        <div className="mt-auto pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="whitespace-nowrap">
              <span className="font-num text-[15px] font-extrabold text-ink">{formatChf(creator.monthlyPriceRappen)}</span>
              <span className="text-xs font-medium text-ink-muted"> / Monat</span>
            </p>
            <p className="font-num text-xs text-ink-muted">
              {countLabel(creator.subscriberCount, "Abonnent", "Abonnenten", formatNumber)} ·{" "}
              {countLabel(creator.postCount, "Post", "Posts", formatNumber)}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

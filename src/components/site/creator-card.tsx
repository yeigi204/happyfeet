import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/components/ui/cn";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { formatChf, formatNumber } from "@/lib/format";
import type { CreatorCard as CreatorCardData } from "@/server/services/creators";

import { countLabel } from "./text";

/** Karte eines Creators (Explore, Landing). Die ganze Karte ist ein Link aufs Profil. Enthält nie Post-Medien. */
export function CreatorCard({ creator, className }: { creator: CreatorCardData; className?: string }) {
  return (
    <Link
      href={`/c/${creator.handle}`}
      className={cn(
        "group flex min-w-0 flex-col rounded-card border border-line bg-surface p-5 transition-[border-color,background-color] duration-150",
        "hover:border-line-strong hover:bg-[color-mix(in_oklab,var(--color-surface),var(--color-surface-2)_45%)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span aria-hidden className="rounded-full transition-shadow duration-150 group-hover:shadow-[0_0_0_2px_var(--color-canvas),0_0_0_4px_var(--color-accent)]">
          <Avatar name={creator.displayName} src={creator.avatarUrl} size="xl" />
        </span>
        {creator.isPremium ? <PremiumBadge /> : null}
      </div>

      <h3 className="mt-5 truncate font-display text-[22px] leading-tight font-bold tracking-[-0.03em] text-ink">
        {creator.displayName}
      </h3>
      <p className="mt-0.5 truncate font-num text-xs text-ink-faint">@{creator.handle}</p>
      <p className="mt-3 line-clamp-3 text-sm leading-relaxed wrap-anywhere text-ink-muted">
        {creator.bio || "Hat noch keine Bio geschrieben – die Bilder sprechen für sich."}
      </p>

      <div className="mt-auto pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line pt-4">
          <p className="whitespace-nowrap">
            <span className="font-num text-[15px] font-medium text-ink tabular-nums">{formatChf(creator.monthlyPriceRappen)}</span>
            <span className="text-xs text-ink-faint"> / Monat</span>
          </p>
          <p className="text-xs text-ink-muted tabular-nums">
            {countLabel(creator.subscriberCount, "Abonnent", "Abonnenten", formatNumber)} ·{" "}
            {countLabel(creator.postCount, "Post", "Posts", formatNumber)}
          </p>
        </div>
      </div>
    </Link>
  );
}

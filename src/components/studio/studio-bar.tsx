import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Container } from "@/components/site/container";
import { Badge } from "@/components/ui/badge";
import { PremiumBadge } from "@/components/ui/premium-badge";
import type { CreatorViewer } from "@/server/auth/guards";

import { StudioNav } from "./studio-nav";

/** Kopf des Studios unter der Seiten-Kopfzeile: Name, Plan/Status, Profil-Link und Navigation. */
export function StudioBar({ viewer }: { viewer: CreatorViewer }) {
  const { verificationStatus, isPremium } = viewer.creator;
  return (
    <div className="pt-5 sm:pt-7">
      <Container>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <p className="font-display text-[22px] leading-none font-extrabold tracking-[-0.045em] text-ink">Studio</p>
            {viewer.handle ? <span className="truncate text-[13px] text-ink-muted">@{viewer.handle}</span> : null}
            {verificationStatus === "approved" ? (
              isPremium ? (
                <PremiumBadge />
              ) : (
                <Badge>Standard</Badge>
              )
            ) : verificationStatus === "pending" ? (
              <Badge tone="warning">In Prüfung</Badge>
            ) : (
              <Badge tone="danger">Abgelehnt</Badge>
            )}
          </div>
          {viewer.handle ? (
            <Link
              href={`/c/${viewer.handle}`}
              className="group inline-flex shrink-0 items-center gap-1 rounded-control text-[13px] font-medium text-ink-muted transition-colors hover:text-ink"
            >
              <span className="hidden sm:inline">Profil ansehen</span>
              <span className="sm:hidden">Profil</span>
              <ArrowUpRight aria-hidden className="size-4 text-ink-faint transition-colors group-hover:text-accent" />
            </Link>
          ) : null}
        </div>
        <div className="mt-4">
          <StudioNav />
        </div>
      </Container>
    </div>
  );
}

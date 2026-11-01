import { ArrowUpRight, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/site/container";
import { CreatorProfileForm } from "@/components/studio/creator-profile-form";
import { rappenToChfInput } from "@/components/studio/price";
import { PageHeader } from "@/components/ui/page-header";
import { planOf } from "@/lib/domain/plans";
import { formatChf } from "@/lib/format";
import { requireCreator } from "@/server/auth/viewer";
import { CREATOR_BIO_MAX_LENGTH, getMyCreatorProfile } from "@/server/services/creators";
import { getPlatformSettings } from "@/server/services/settings";

import { updateCreatorProfileAction } from "./actions";

export const metadata: Metadata = { title: "Einstellungen · Studio" };

export default async function StudioSettingsPage() {
  const viewer = await requireCreator();
  const [profile, settings] = await Promise.all([getMyCreatorProfile(viewer), getPlatformSettings()]);
  const currentPrice = profile?.monthlyPriceRappen ?? null;

  return (
    <Container className="py-8 sm:py-12">
      <PageHeader eyebrow="Studio · Einstellungen" title="Einstellungen" description="So stellst du dich auf deinem Profil vor – und so viel kostet ein Abo bei dir." />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
        <section aria-label="Bio und Preis" className="rounded-card border border-line bg-surface p-5 sm:p-7">
          <CreatorProfileForm
            action={updateCreatorProfileAction}
            defaults={{ bio: profile?.bio ?? "", price: currentPrice !== null ? rappenToChfInput(currentPrice) : "" }}
            rules={{
              minPriceRappen: settings.minPriceRappen,
              maxPriceRappen: settings.maxPriceRappen,
              bioMaxLength: CREATOR_BIO_MAX_LENGTH,
              standardFeeBps: settings.standardFeeBps,
              premiumFeeBps: settings.premiumFeeBps,
            }}
            plan={planOf(viewer.creator.isPremium)}
            submitLabel="Speichern"
            pendingLabel="Wird gespeichert …"
          />
        </section>

        <aside className="grid content-start gap-4">
          <div className="rounded-card border border-line bg-surface p-5">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <Info aria-hidden className="size-4 text-ink-faint" />
              Preis ändern
            </p>
            {currentPrice !== null ? (
              <p className="mt-3 flex items-baseline justify-between gap-3 border-b border-line pb-3">
                <span className="text-sm text-ink-muted">Aktuell gespeichert</span>
                <span className="font-mono text-[15px] font-medium text-ink tabular-nums">{formatChf(currentPrice)}</span>
              </p>
            ) : null}
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              Ein neuer Preis gilt nur für neue Abonnenten. Wer dich schon abonniert hat, behält den bisherigen Preis.
            </p>
          </div>
          {viewer.handle ? (
            <Link
              href={`/c/${viewer.handle}`}
              className="group flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-5 transition-colors hover:border-line-strong"
            >
              <span>
                <span className="block text-[13px] font-semibold text-ink">Dein Profil</span>
                <span className="mt-1 block font-mono text-xs text-ink-faint">happyfeet · /c/{viewer.handle}</span>
              </span>
              <ArrowUpRight aria-hidden className="size-5 text-ink-faint transition-colors group-hover:text-accent" />
            </Link>
          ) : null}
        </aside>
      </div>
    </Container>
  );
}

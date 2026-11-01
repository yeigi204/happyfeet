import { BadgeCheck, Check, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache, type ReactNode } from "react";

import { PostCard } from "@/components/posts/post-card";
import { SubscribeButton } from "@/components/posts/subscribe-button";
import { Container } from "@/components/site/container";
import { ProfileAvatar } from "@/components/site/profile-avatar";
import { countLabel } from "@/components/site/text";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { Stat } from "@/components/ui/stat";
import type { Viewer } from "@/lib/domain/types";
import { formatChf, formatDate, formatNumber } from "@/lib/format";
import { getViewer } from "@/server/auth/viewer";
import { getCreatorPage, type CreatorPageData } from "@/server/services/creators";

import { reportPostAction, startCheckoutAction } from "./actions";

/** Einmal pro Request laden – `generateMetadata` und die Seite teilen sich das Ergebnis. */
const loadCreatorPage = cache(async (handle: string) => {
  const viewer = await getViewer();
  return { viewer, page: await getCreatorPage(viewer, handle) };
});

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Route-Parameter kommen prozent-kodiert an (z. B. `%40handle`). */
function decodeHandle(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: PageProps<"/c/[handle]">): Promise<Metadata> {
  const handle = decodeHandle((await params).handle);
  const { page } = await loadCreatorPage(handle);
  if (!page) return { title: "Profil nicht gefunden" };
  const { creator } = page;
  return {
    title: `${creator.displayName} (@${creator.handle})`,
    description:
      creator.bio.slice(0, 160) ||
      `${creator.displayName} auf happyfeet – Fussbilder im Abo für ${formatChf(creator.monthlyPriceRappen)} im Monat.`,
  };
}

export default async function CreatorProfilePage({ params, searchParams }: PageProps<"/c/[handle]">) {
  const handle = decodeHandle((await params).handle);
  const aboOk = firstParam((await searchParams).abo) === "ok";
  const { viewer, page } = await loadCreatorPage(handle);
  if (!page) notFound();

  const { creator, viewerRelation, posts } = page;
  // Kanonische Adresse: /c/<handle> in Kleinbuchstaben, ohne „@“.
  if (handle !== creator.handle) redirect(`/c/${creator.handle}${aboOk ? "?abo=ok" : ""}`);

  const now = new Date();
  const profilePath = `/c/${creator.handle}`;
  const priceLabel = `Abonnieren für ${formatChf(creator.monthlyPriceRappen)}/Monat`;
  const canAct = viewer !== null && viewer.status === "active";
  const subscribeAction = startCheckoutAction.bind(null, creator.userId);
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(profilePath)}`;
  // Fremde sehen nur freigegebene Profile; Eigentümer und Admins auch unfreigegebene.
  const approved = creator.verificationStatus === "approved";
  const hiddenCount = viewerRelation.isOwner ? posts.filter((p) => p.moderationStatus !== "approved").length : 0;

  // Angemeldet, aber gesperrt: kein Abo-Aufruf (die Anmeldung würde nicht weiterhelfen).
  const blocked = viewer !== null && !canAct;
  const lockedAction: ReactNode =
    viewerRelation.isOwner || blocked || !approved ? null : canAct ? (
      <SubscribeButton action={subscribeAction} variant="secondary">
        {priceLabel}
      </SubscribeButton>
    ) : (
      <ButtonLink href={signInHref} variant="secondary">
        {priceLabel}
      </ButtonLink>
    );

  return (
    <Container className="pt-4 sm:pt-8">
      {aboOk && viewerRelation.isSubscribed ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-3 rounded-card border border-success/35 bg-[color-mix(in_oklab,var(--color-surface),var(--color-success)_8%)] px-4 py-3.5 sm:items-center"
        >
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-success text-surface">
            <Check className="size-4" />
          </span>
          <p className="flex-1 text-sm text-ink">
            <span className="font-semibold">Willkommen im Abo!</span> Alle Posts von {creator.displayName} sind jetzt
            freigeschaltet – und neue landen ab sofort in deinem{" "}
            <Link href="/feed" className="font-medium underline underline-offset-4 hover:text-accent">
              Feed
            </Link>
            .
          </p>
          <Link
            href={profilePath}
            replace
            scroll={false}
            className="-m-1.5 grid size-8 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            <X aria-hidden className="size-4" />
            <span className="sr-only">Hinweis schliessen</span>
          </Link>
        </div>
      ) : null}

      <Banner url={creator.bannerUrl} name={creator.displayName} />

      <div className="grid gap-x-12 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Profilkopf */}
        <section aria-labelledby="creator-name" className="lg:col-start-1">
          <ProfileAvatar name={creator.displayName} src={creator.avatarUrl} className="relative -mt-12 -ml-1 sm:-mt-16" />
          <div className="mt-4">
            <h1
              id="creator-name"
              className="font-display text-[40px] leading-[0.92] font-extrabold tracking-[-0.055em] wrap-anywhere text-ink sm:text-[60px]"
            >
              {creator.displayName}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-ink-muted">@{creator.handle}</span>
              {approved ? <Badge icon={<BadgeCheck aria-hidden className="text-ink-muted" />}>Geprüft</Badge> : null}
              {creator.isPremium ? <PremiumBadge /> : null}
            </div>
            {creator.bio ? (
              <p className="mt-5 max-w-[60ch] text-base leading-relaxed whitespace-pre-line wrap-break-word text-ink-muted">{creator.bio}</p>
            ) : null}
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-4">
              <ProfileFact label="Abonnenten" value={formatNumber(creator.subscriberCount)} />
              <ProfileFact label="Posts" value={formatNumber(creator.postCount)} />
              <ProfileFact label="Monatspreis" value={formatChf(creator.monthlyPriceRappen)} />
            </dl>
          </div>
        </section>

        {/* Abo-Panel */}
        <aside aria-label="Abo" className="mt-8 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <AboPanel
            page={page}
            viewer={viewer}
            canAct={canAct}
            subscribe={<SubscribeButton action={subscribeAction} size="lg" block>{priceLabel}</SubscribeButton>}
            signInHref={signInHref}
          />
        </aside>

        {/* Posts */}
        <section aria-labelledby="posts-title" className="mt-12 lg:col-start-1">
          <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
            <h2 id="posts-title" className="font-display text-2xl font-bold tracking-[-0.03em]">
              Posts
            </h2>
            <p className="font-mono text-xs text-ink-faint tabular-nums">
              {countLabel(posts.length, "Post", "Posts", formatNumber)}
              {hiddenCount > 0 ? ` · ${formatNumber(hiddenCount)} nicht öffentlich` : null}
              {!viewerRelation.isOwner && !viewerRelation.isSubscribed && posts.some((p) => p.locked)
                ? ` · ${formatNumber(posts.filter((p) => p.locked).length)} gesperrt`
                : null}
            </p>
          </div>

          {posts.length === 0 ? (
            <EmptyState
              className="mt-6"
              title={viewerRelation.isOwner ? "Du hast noch nichts veröffentlicht" : "Noch keine Posts"}
              description={
                !viewerRelation.isOwner
                  ? `${creator.displayName} hat noch nichts veröffentlicht. Schau bald wieder vorbei.`
                  : approved
                    ? "Lade deine ersten Bilder hoch – sobald sie freigegeben sind, erscheinen sie hier."
                    : "Sobald wir dein Profil freigegeben haben, kannst du im Studio deine ersten Bilder hochladen."
              }
              action={
                viewerRelation.isOwner && approved ? (
                  <ButtonLink href="/studio/posts/new" variant="primary" size="sm">
                    Ersten Post erstellen
                  </ButtonLink>
                ) : undefined
              }
            />
          ) : (
            <ul className="mt-6 grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {posts.map((post) => (
                <li key={post.id}>
                  <PostCard
                    post={post}
                    variant="profile"
                    now={now}
                    reportAction={canAct && !viewerRelation.isOwner ? reportPostAction : undefined}
                    lockedAction={lockedAction}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Container>
  );
}

function Banner({ url, name }: { url: string | null; name: string }) {
  return (
    <div className="relative aspect-[2/1] overflow-hidden rounded-card border border-line bg-surface-2 sm:aspect-[3/1] lg:aspect-[4/1]">
      {url ? (
        <img src={url} alt={`Titelbild von ${name}`} decoding="async" className="absolute inset-0 size-full object-cover" />
      ) : (
        <svg aria-hidden viewBox="0 0 34 26" className="absolute top-1/2 left-1/2 h-3/5 -translate-x-1/2 -translate-y-1/2">
          <ellipse cx="7" cy="15.5" rx="5" ry="6.4" transform="rotate(-8 7 15.5)" fill="var(--color-accent-soft)" />
          <g fill="none" stroke="var(--color-line-strong)" strokeWidth="0.8">
            <ellipse cx="16" cy="9.4" rx="3" ry="3.4" />
            <ellipse cx="22.4" cy="8.6" rx="2.6" ry="2.9" />
            <ellipse cx="27.6" cy="10.8" rx="2.2" ry="2.5" />
            <ellipse cx="31" cy="15.4" rx="1.8" ry="2" />
          </g>
        </svg>
      )}
    </div>
  );
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1.5 font-mono text-[15px] font-medium text-ink tabular-nums">{value}</dd>
    </div>
  );
}

function AboPanel({
  page,
  viewer,
  canAct,
  subscribe,
  signInHref,
}: {
  page: CreatorPageData;
  viewer: Viewer | null;
  canAct: boolean;
  subscribe: ReactNode;
  signInHref: string;
}) {
  const { creator, viewerRelation } = page;

  if (viewerRelation.isOwner) {
    const status = viewer?.creator?.verificationStatus;
    return (
      <div className="rounded-card border border-line bg-surface p-5">
        <p className="eyebrow">Deine Seite</p>
        <p className="mt-3 font-display text-2xl leading-tight font-bold tracking-[-0.03em]">Das ist dein Profil.</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {status === "approved"
            ? "So sehen Fans deine Seite. Posts nur für Abonnenten erscheinen für alle anderen verpixelt."
            : "Dein Profil ist noch nicht öffentlich – nur du siehst diese Seite, bis wir deine Bewerbung freigegeben haben."}
        </p>
        <div className="mt-5 grid gap-2">
          <ButtonLink href="/studio" variant="primary" className="w-full">
            Zum Studio
          </ButtonLink>
          {status === "approved" ? (
            <ButtonLink href="/studio/posts/new" variant="secondary" className="w-full">
              Neuer Post
            </ButtonLink>
          ) : null}
        </div>
      </div>
    );
  }

  if (creator.verificationStatus !== "approved") {
    // Nur Admins kommen hierher (Fremde erhalten für unfreigegebene Profile eine 404).
    return (
      <div className="rounded-card border border-line bg-surface p-5">
        <p className="eyebrow">Nicht öffentlich</p>
        <p className="mt-3 font-display text-2xl leading-tight font-bold tracking-[-0.03em]">
          {creator.verificationStatus === "pending" ? "Bewerbung in Prüfung." : "Bewerbung abgelehnt."}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Fans sehen dieses Profil nicht und können es nicht abonnieren.
        </p>
        <div className="mt-5 grid gap-2">
          <ButtonLink href="/admin/verifications" variant="secondary" className="w-full">
            Zu den Verifizierungen
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (viewerRelation.isSubscribed) {
    const sub = viewerRelation.subscription;
    const canceled = sub?.cancelAtPeriodEnd ?? false;
    return (
      <div className="rounded-card border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">Dein Abo</p>
          {canceled ? <Badge tone="warning">Gekündigt</Badge> : <Badge tone="success">Aktiv</Badge>}
        </div>
        <p className="mt-3 font-display text-2xl leading-tight font-bold tracking-[-0.03em]">
          {canceled ? "Noch freigeschaltet." : "Du bist dabei."}
        </p>
        {sub ? (
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {canceled ? (
              <>
                Du hast gekündigt. Alle Posts bleiben bis zum{" "}
                <span className="font-mono text-ink">{formatDate(sub.currentPeriodEnd)}</span> sichtbar.
              </>
            ) : (
              <>
                Aktiv bis <span className="font-mono text-ink">{formatDate(sub.currentPeriodEnd)}</span> – danach verlängert es sich
                automatisch um einen Monat.
              </>
            )}
          </p>
        ) : null}
        <ButtonLink href="/subscriptions" variant="secondary" className="mt-5 w-full">
          {canceled ? "Abo ansehen" : "Abo verwalten oder kündigen"}
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <Stat label={`Abo bei ${creator.displayName}`} value={formatChf(creator.monthlyPriceRappen)} hint="pro Monat" />
      <ul className="mt-5 grid gap-2.5 border-t border-line pt-4 text-sm text-ink">
        {[
          creator.postCount > 0
            ? `${countLabel(creator.postCount, "Post", "Posts", formatNumber)} in voller Auflösung`
            : "Alle künftigen Posts in voller Auflösung",
          "Neue Posts direkt in deinem Feed",
          "Monatlich kündbar, Zugang bis Periodenende",
        ].map((item) => (
          <li key={item} className="flex items-start gap-2.5">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
            {item}
          </li>
        ))}
      </ul>
      <div className="mt-5">
        {canAct ? (
          subscribe
        ) : viewer ? (
          <div role="note" className="grid gap-2 rounded-control border border-line bg-surface-2 px-4 py-3.5 text-sm">
            <p className="font-medium text-ink">Dein Konto ist gesperrt.</p>
            <p className="leading-relaxed text-ink-muted">
              Solange die Sperre gilt, kannst du keine Abos abschliessen.{" "}
              <Link href="/banned" className="font-medium text-ink underline underline-offset-4 hover:text-accent">
                Mehr zur Sperre
              </Link>
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            <ButtonLink href={signInHref} variant="primary" size="lg" className="w-full">
              Anmelden und abonnieren
            </ButtonLink>
            <p className="text-center text-xs text-ink-muted">
              Noch kein Konto?{" "}
              <Link href="/sign-up" className="font-medium text-ink underline underline-offset-4 hover:text-accent">
                Konto erstellen
              </Link>
            </p>
          </div>
        )}
      </div>
      <p className="mt-4 text-center font-mono text-[10.5px] tracking-[0.08em] text-ink-faint uppercase">Bezahlt in CHF · Ab 18</p>
    </div>
  );
}

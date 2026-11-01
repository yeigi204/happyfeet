import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Container } from "@/components/site/container";
import { countLabel } from "@/components/site/text";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { formatChf, formatDate, formatNumber } from "@/lib/format";
import { requireOnboardedViewer } from "@/server/auth/viewer";
import { listMySubscriptions, type MySubscription } from "@/server/services/subscriptions";

import { cancelSubscriptionAction } from "./actions";
import { CancelSubscriptionButton } from "./cancel-button";

export const metadata: Metadata = { title: "Deine Abos" };

export default async function SubscriptionsPage() {
  const viewer = await requireOnboardedViewer();
  const subscriptions = await listMySubscriptions(viewer);

  const running = subscriptions.filter((s) => s.active);
  const ended = subscriptions.filter((s) => !s.active);
  const renewing = running.filter((s) => !s.cancelAtPeriodEnd && s.status === "active");
  const monthly = renewing.reduce((sum, s) => sum + s.priceRappen, 0);
  const next = [...renewing]
    .filter((s): s is MySubscription & { currentPeriodEnd: Date } => s.currentPeriodEnd !== null)
    .sort((a, b) => a.currentPeriodEnd.getTime() - b.currentPeriodEnd.getTime())[0];

  return (
    <Container className="py-10 sm:py-14">
      <PageHeader
        eyebrow={`Abos · ${countLabel(running.length, "laufend", "laufend", formatNumber)}`}
        title="Deine Abos"
        description="Preis, Laufzeit und Kündigung – alles an einem Ort. Gekündigte Abos bleiben bis zum Ende der bezahlten Periode freigeschaltet."
        actions={
          subscriptions.length > 0 ? (
            <ButtonLink href="/explore" variant="secondary" size="sm">
              Weitere Creator entdecken
            </ButtonLink>
          ) : undefined
        }
      />

      {subscriptions.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="Noch keine Abos"
          description="Wenn du einen Creator abonnierst, siehst du hier Preis, Laufzeit und kannst jederzeit kündigen."
          action={
            <ButtonLink href="/explore" variant="primary" size="sm">
              Creator entdecken
            </ButtonLink>
          }
        />
      ) : (
        <>
          {running.length > 0 ? (
            <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3">
              <div className="bg-surface p-4 sm:p-5">
                <Stat label="Laufende Abos" value={formatNumber(running.length)} />
              </div>
              <div className="bg-surface p-4 sm:p-5">
                <Stat
                  label="Du zahlst monatlich"
                  value={formatChf(monthly)}
                  hint={renewing.length < running.length ? "ohne gekündigte Abos" : undefined}
                />
              </div>
              <div className="col-span-2 bg-surface p-4 sm:col-span-1 sm:p-5">
                <Stat
                  label="Nächste Verlängerung"
                  value={next ? formatDate(next.currentPeriodEnd) : "–"}
                  hint={next ? `${next.creator.displayName} · ${formatChf(next.priceRappen)}` : "Keine – alle gekündigt"}
                />
              </div>
            </div>
          ) : null}

          {running.length > 0 ? <SubscriptionList title="Laufend" subscriptions={running} /> : null}
          {ended.length > 0 ? <SubscriptionList title="Beendet" subscriptions={ended} /> : null}
        </>
      )}
    </Container>
  );
}

function SubscriptionList({ title, subscriptions }: { title: string; subscriptions: MySubscription[] }) {
  const id = `abos-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="flex items-baseline gap-2 font-display text-xl font-bold tracking-[-0.03em]">
        {title}
        <span className="font-mono text-xs font-normal text-ink-faint tabular-nums">{formatNumber(subscriptions.length)}</span>
      </h2>
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {subscriptions.map((sub) => (
          <SubscriptionRow key={sub.id} sub={sub} />
        ))}
      </ul>
    </section>
  );
}

function SubscriptionRow({ sub }: { sub: MySubscription }) {
  const end = sub.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : null;
  const canCancel = sub.active && sub.status === "active" && !sub.cancelAtPeriodEnd && end !== null;

  let status: { badge: ReactNode; text: ReactNode };
  if (sub.active && !sub.cancelAtPeriodEnd) {
    status = {
      badge: <Badge tone="success">Aktiv</Badge>,
      text: end ? (
        <>
          Verlängert sich am <span className="font-mono text-ink">{end}</span>
        </>
      ) : (
        "Läuft"
      ),
    };
  } else if (sub.active) {
    status = {
      badge: <Badge tone="warning">Gekündigt</Badge>,
      text: end ? (
        <>
          Freigeschaltet bis <span className="font-mono text-ink">{end}</span>
        </>
      ) : (
        "Läuft aus"
      ),
    };
  } else {
    status = {
      badge: <Badge>Beendet</Badge>,
      text: end ? (
        <>
          Endete am <span className="font-mono text-ink">{end}</span>
        </>
      ) : (
        "Beendet"
      ),
    };
  }

  return (
    <li className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
      <div className="flex min-w-0 items-center gap-3.5">
        <Link href={`/c/${sub.creator.handle}`} aria-hidden tabIndex={-1} className="shrink-0">
          <Avatar name={sub.creator.displayName} src={sub.creator.avatarUrl} size="lg" />
        </Link>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/c/${sub.creator.handle}`}
              className="truncate rounded-control font-semibold text-ink underline-offset-4 hover:underline"
            >
              {sub.creator.displayName}
            </Link>
            {status.badge}
          </p>
          <p className="mt-1 text-[13px] text-ink-muted">
            <span className="font-mono text-ink-faint">@{sub.creator.handle}</span>
            <span aria-hidden> · </span>
            {status.text}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pl-[3.875rem] sm:justify-end sm:pl-0">
        <p className="whitespace-nowrap">
          <span className="font-mono text-[15px] font-medium text-ink tabular-nums">{formatChf(sub.priceRappen)}</span>
          <span className="text-xs text-ink-faint"> / Monat</span>
        </p>
        <div className="flex justify-end sm:min-w-[9.5rem]">
          {canCancel ? (
            <CancelSubscriptionButton
              action={cancelSubscriptionAction.bind(null, sub.id)}
              creatorName={sub.creator.displayName}
              accessUntil={end}
            />
          ) : !sub.active ? (
            <ButtonLink href={`/c/${sub.creator.handle}`} variant="secondary" size="sm">
              Erneut abonnieren
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </li>
  );
}

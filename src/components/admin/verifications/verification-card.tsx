import { Check, ExternalLink, OctagonAlert } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatChf, formatDate, formatDateTime, formatRelative } from "@/lib/format";
import type { VerificationStatus } from "@/lib/domain/types";

import { UrgencyBadge } from "../urgency-badge";
import { VerificationActions } from "./verification-actions";

export type VerificationCardItem = {
  userId: string;
  handle: string;
  displayName: string;
  email: string | null;
  birthDate: string | null;
  age: number | null;
  bio: string;
  monthlyPriceRappen: number;
  appliedAt: Date;
  status: VerificationStatus;
  note: string | null;
  verifiedAt: Date | null;
};

function birthDateLabel(birthDate: string | null): string {
  return birthDate ? formatDate(new Date(`${birthDate}T12:00:00Z`)) : "–";
}

function TimeAgo({ date, now }: { date: Date; now: Date }) {
  return (
    <time dateTime={date.toISOString()} title={formatDateTime(date)}>
      {formatRelative(date, now)}
    </time>
  );
}

/** Ein Creator-Antrag: wer, wie alt, zu welchem Preis, mit welcher Bio – und die Entscheidung. */
export function VerificationCard({ item, now }: { item: VerificationCardItem; now: Date }) {
  const adult = item.age !== null && item.age >= 18;
  const pending = item.status === "pending";

  return (
    <article aria-labelledby={`app-${item.userId}`} className="grid overflow-hidden rounded-card border border-line bg-surface lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 p-5 sm:p-6">
        <header className="flex items-start gap-3.5">
          <Avatar name={item.displayName} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 id={`app-${item.userId}`} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-display text-xl leading-tight font-bold tracking-[-0.03em] text-ink">
              {item.displayName}
              {pending ? <UrgencyBadge oldestAt={item.appliedAt} now={now} className="font-sans tracking-normal" /> : null}
            </h2>
            <p className="mt-1 flex flex-wrap gap-x-2 font-num text-xs text-ink-faint">
              <span className="text-ink-muted">@{item.handle}</span>
              {item.email ? <span className="break-all">{item.email}</span> : null}
            </p>
          </div>
        </header>

        <div className="mt-5">
          <p className="eyebrow mb-2">Bio</p>
          {item.bio.trim() ? (
            <p className="max-w-prose text-[14.5px] leading-relaxed whitespace-pre-line text-ink">{item.bio}</p>
          ) : (
            <p className="text-sm text-ink-faint">Keine Bio angegeben.</p>
          )}
        </div>

        {item.note ? (
          <div className="mt-5 border-l-2 border-line-strong pl-3">
            <p className="eyebrow mb-1.5">{item.status === "rejected" ? "Begründung der Ablehnung" : "Notiz"}</p>
            <p className="max-w-prose text-sm whitespace-pre-line text-ink-muted">{item.note}</p>
          </div>
        ) : null}
      </div>

      <aside className="grid content-between gap-5 border-t border-line bg-surface-2/40 p-5 sm:p-6 lg:border-t-0 lg:border-l">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-[13px]">
          <div>
            <dt className="eyebrow">Alter</dt>
            <dd className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="font-num text-ink tabular-nums">{item.age === null ? "–" : `${item.age} J.`}</span>
              {item.age === null ? (
                <Badge tone="danger">Geburtsdatum fehlt</Badge>
              ) : adult ? (
                <Badge tone="success" icon={<Check aria-hidden />}>
                  volljährig
                </Badge>
              ) : (
                <Badge tone="danger" icon={<OctagonAlert aria-hidden />}>
                  minderjährig
                </Badge>
              )}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Geburtsdatum</dt>
            <dd className="mt-1.5 font-num text-ink tabular-nums">{birthDateLabel(item.birthDate)}</dd>
          </div>
          <div>
            <dt className="eyebrow">Abo-Preis</dt>
            <dd className="mt-1.5 font-num text-ink tabular-nums">
              {formatChf(item.monthlyPriceRappen)}
              <span className="text-ink-faint"> / Mt.</span>
            </dd>
          </div>
          <div>
            <dt className="eyebrow">{pending ? "Beworben" : item.status === "approved" ? "Freigegeben" : "Abgelehnt"}</dt>
            <dd className="mt-1.5 text-ink-muted">
              <TimeAgo date={pending ? item.appliedAt : (item.verifiedAt ?? item.appliedAt)} now={now} />
            </dd>
          </div>
        </dl>

        <div className="grid gap-3">
          {pending ? (
            <>
              <VerificationActions userId={item.userId} handle={item.handle} canApprove={adult} />
              {!adult ? <p className="text-xs text-ink-muted">Freigabe erst mit bestätigter Volljährigkeit möglich.</p> : null}
            </>
          ) : (
            <Badge tone={item.status === "approved" ? "success" : "danger"} className="justify-self-start">{item.status === "approved" ? "Creator aktiv" : "Abgelehnt"}</Badge>
          )}
          <Link href={`/c/${item.handle}`} className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink">
            <ExternalLink aria-hidden className="size-3.5" />
            Profil ansehen
          </Link>
        </div>
      </aside>
    </article>
  );
}

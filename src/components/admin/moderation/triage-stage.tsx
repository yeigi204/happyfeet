"use client";

import { Globe, ImageOff, LockKeyhole, Trash2 } from "lucide-react";
import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { REPORT_REASONS } from "@/lib/domain/reports";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";

import { UrgencyBadge } from "../urgency-badge";
import { SeverityBadge } from "./severity-badge";
import type { TriageItem } from "./types";

export type TriageStageProps = {
  item: TriageItem;
  now: Date;
  premoderationCount: number;
  onImageError: () => void;
};

function Time({ date, now }: { date: Date; now: Date }) {
  return (
    <time dateTime={date.toISOString()} title={formatDateTime(date)}>
      {formatRelative(date, now)}
    </time>
  );
}

/** Wie weit ist der Creator in der Vorab-Prüfung? Segmente = nötige Freigaben. */
function PremoderationProgress({ approved, required }: { approved: number; required: number }) {
  if (required <= 0) return null;
  const done = Math.min(approved, required);
  const left = required - done;
  return (
    <div>
      <p className="eyebrow mb-2">Vorab-Prüfung</p>
      <div aria-hidden className="flex gap-1">
        {Array.from({ length: Math.min(required, 20) }, (_, i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < done ? "bg-series-2" : "bg-line-strong")} />
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        {formatNumber(done)} von {formatNumber(required)} Posts freigegeben
        {left > 0
          ? ` – noch ${left === 1 ? "eine Freigabe" : `${formatNumber(left)} Freigaben`}, dann veröffentlicht der Creator direkt.`
          : " – weitere Posts gehen direkt online."}
      </p>
    </div>
  );
}

/** Rechte Seite: grosses Bild (Original), Bildwahl, Kontext zu Post, Creator und Meldung. */
export function TriageStage({ item, now, premoderationCount, onImageError }: TriageStageProps) {
  const [mediaIndex, setMediaIndex] = useState(0);
  const { post } = item;
  const media = post.media[mediaIndex] ?? post.media[0];
  const count = post.media.length;
  const report = item.kind === "report" ? item.report : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid min-w-0 content-start gap-3">
        {/* Mobil passt sich der Rahmen dem Bild an (keine leeren Balken); ab lg feste Bühne, damit die Werkzeugleiste nicht springt. */}
        <div className="relative flex min-h-40 items-center justify-center overflow-hidden rounded-card border border-line bg-canvas lg:h-[min(68vh,680px)]">
          {media ? (
            <img
              key={media.id}
              src={media.url}
              width={media.width}
              height={media.height}
              alt={`Bild ${mediaIndex + 1} von ${count} im Post von @${post.creator.handle}`}
              loading="lazy"
              decoding="async"
              onError={onImageError}
              style={{ aspectRatio: `${media.width} / ${media.height}` }}
              className="block h-auto max-h-[min(62vh,520px)] w-auto max-w-full animate-rise object-contain lg:max-h-full"
            />
          ) : (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <ImageOff aria-hidden className="size-4" />
              Dieser Post enthält keine Bilder.
            </p>
          )}
          {count > 1 ? (
            <span className="absolute top-3 left-3 rounded-[4px] border border-line-strong bg-surface/90 px-1.5 py-1 font-num text-[11px] leading-none text-ink tabular-nums">
              {mediaIndex + 1} / {count}
            </span>
          ) : null}
        </div>
        {count > 1 ? (
          <div role="group" aria-label="Bilder im Post" className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {post.media.map((m, i) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={i === mediaIndex}
                aria-label={`Bild ${i + 1} anzeigen`}
                onClick={() => setMediaIndex(i)}
                className="size-16 shrink-0 overflow-hidden rounded-control border border-line opacity-60 transition-opacity hover:opacity-100 aria-pressed:border-accent aria-pressed:opacity-100"
              >
                <img src={m.url} alt="" width={64} height={64} loading="lazy" decoding="async" className="size-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <aside aria-label="Details" className="grid content-start gap-5 self-start rounded-card border border-line bg-surface p-4 sm:p-5">
        {report ? (
          <div className="grid gap-3 border-b border-line pb-5">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={report.severity} />
              <UrgencyBadge oldestAt={report.createdAt} now={now} />
            </div>
            <p className="font-display text-lg leading-tight font-semibold tracking-[-0.02em] text-ink">{REPORT_REASONS[report.reason].label}</p>
            {report.details.trim() ? (
              <blockquote className="border-l-2 border-line-strong pl-3 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-muted">{report.details}</blockquote>
            ) : (
              <p className="text-xs text-ink-faint">Ohne weitere Angaben gemeldet.</p>
            )}
            <p className="text-xs text-ink-faint">
              {report.reporterHandle ? <span className="font-num text-ink-muted">@{report.reporterHandle}</span> : "Gelöschtes Konto"} · <Time date={report.createdAt} now={now} />
              {report.openReportsOnPost > 1 ? ` · ${formatNumber(report.openReportsOnPost)} offene Meldungen zu diesem Post` : null}
            </p>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <Avatar name={post.creator.displayName} size="md" />
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-[14px] font-medium text-ink">
              <span className="truncate">{post.creator.displayName}</span>
              {post.creator.isPremium ? <PremiumBadge compact /> : null}
            </p>
            <p className="truncate font-num text-xs text-ink-faint">@{post.creator.handle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {post.visibility === "public" ? (
            <Badge icon={<Globe aria-hidden />}>Öffentlich</Badge>
          ) : (
            <Badge icon={<LockKeyhole aria-hidden />}>Nur Abonnenten</Badge>
          )}
          {post.deletedAt ? (
            <Badge tone="warning" icon={<Trash2 aria-hidden />}>
              vom Creator gelöscht
            </Badge>
          ) : null}
          {!report ? <UrgencyBadge oldestAt={post.createdAt} now={now} /> : null}
          <span className="text-xs text-ink-faint">
            eingereicht <Time date={post.createdAt} now={now} />
          </span>
        </div>

        <div>
          <p className="eyebrow mb-2">Bildtext</p>
          {post.caption.trim() ? (
            <p className="max-h-48 overflow-y-auto text-[13.5px] leading-relaxed whitespace-pre-line text-ink">{post.caption}</p>
          ) : (
            <p className="text-xs text-ink-faint">Kein Bildtext.</p>
          )}
        </div>

        {item.kind === "post" ? <PremoderationProgress approved={post.creator.approvedPostCount} required={premoderationCount} /> : null}
      </aside>
    </div>
  );
}

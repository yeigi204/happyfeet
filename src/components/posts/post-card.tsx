import { Globe } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { PremiumBadge } from "@/components/ui/premium-badge";
import type { ModerationStatus } from "@/lib/domain/types";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { PostView } from "@/server/services/posts";

import { LockedOverlay } from "./locked-overlay";
import { PostGallery } from "./post-gallery";
import { ReportDialog, type ReportAction } from "./report-dialog";

const MODERATION: Partial<Record<ModerationStatus, { label: string; tone: "warning" | "danger"; hint: string }>> = {
  pending: { label: "In Prüfung", tone: "warning", hint: "Nur für dich sichtbar, bis wir den Post freigeben." },
  rejected: { label: "Abgelehnt", tone: "danger", hint: "Dieser Post ist nicht öffentlich." },
  removed: { label: "Entfernt", tone: "danger", hint: "Dieser Post wurde von der Moderation entfernt." },
};

export type PostCardProps = {
  post: PostView;
  /** `feed`: mit Creator-Kopf; `profile`: ohne (die Seite gehört ja dem Creator). */
  variant: "feed" | "profile";
  now: Date;
  /** Melden-Aktion; ohne (Gäste, eigene Posts) gibt es keinen Melden-Knopf. */
  reportAction?: ReportAction;
  /** Abo-Aufruf im gesperrten Zustand (Button oder Anmelde-Link). */
  lockedAction?: ReactNode;
  className?: string;
};

export function PostCard({ post, variant, now, reportAction, lockedAction, className }: PostCardProps) {
  const at = post.publishedAt ?? post.createdAt;
  const moderation = MODERATION[post.moderationStatus];
  const label = `Post von ${post.creator.displayName}`;
  const time = (
    <time dateTime={at.toISOString()} title={formatDateTime(at)} className="tabular-nums">
      {formatRelative(at, now)}
    </time>
  );

  return (
    <article aria-label={`${label}, ${formatDateTime(at)}`} className={cn("min-w-0 rounded-card border border-line bg-surface", className)}>
      {variant === "feed" ? (
        <header className="flex items-center gap-3 px-4 py-3">
          <Link href={`/c/${post.creator.handle}`} aria-hidden tabIndex={-1} className="shrink-0">
            <Avatar name={post.creator.displayName} src={post.creator.avatarUrl} size="md" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5">
              <Link
                href={`/c/${post.creator.handle}`}
                className="truncate rounded-control text-sm font-semibold text-ink underline-offset-4 hover:underline"
              >
                {post.creator.displayName}
              </Link>
              {post.creator.isPremium ? <PremiumBadge compact /> : null}
            </p>
            <p className="truncate font-mono text-[11.5px] text-ink-faint">
              @{post.creator.handle} · {time}
            </p>
          </div>
        </header>
      ) : null}

      <div className={variant === "feed" ? "px-2" : "p-2"}>
        {post.locked ? (
          <LockedOverlay preview={post.media[0]} imageCount={post.mediaCount} action={lockedAction} />
        ) : (
          <PostGallery images={post.media} label={label} />
        )}
      </div>

      <div className="px-4 pt-3 pb-2">
        {moderation ? (
          <div className="mb-3 rounded-control border border-line bg-surface-2 px-3 py-2.5">
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
              <Badge tone={moderation.tone}>{moderation.label}</Badge>
              {moderation.hint}
            </p>
            {post.moderationNote ? <p className="mt-1.5 text-[13px] text-ink">Notiz der Moderation: {post.moderationNote}</p> : null}
          </div>
        ) : null}
        {post.caption ? (
          <p className={cn("text-[15px] leading-relaxed whitespace-pre-line wrap-break-word text-ink", post.locked && "line-clamp-3")}>{post.caption}</p>
        ) : null}
      </div>

      <footer className="flex min-h-12 items-center justify-between gap-3 px-4 pb-2">
        <p className="flex items-center gap-2 text-xs text-ink-faint">
          {variant === "profile" ? time : null}
          {post.visibility === "public" ? (
            <span className="inline-flex items-center gap-1" title="Für alle sichtbar, auch ohne Abo">
              <Globe aria-hidden className="size-3" />
              Öffentlich
            </span>
          ) : null}
        </p>
        {reportAction ? <ReportDialog postId={post.id} action={reportAction} creatorName={post.creator.displayName} /> : null}
      </footer>
    </article>
  );
}

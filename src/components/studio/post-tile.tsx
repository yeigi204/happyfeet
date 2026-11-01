import { Globe, Images, Lock, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import type { ModerationStatus } from "@/lib/domain/types";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { PostView } from "@/server/services/posts";

import { ConfirmActionButton, type ConfirmState } from "./confirm-action-button";

const STATUS: Record<ModerationStatus, { label: string; tone: "success" | "warning" | "danger"; hint: string }> = {
  approved: { label: "Online", tone: "success", hint: "Für deine Fans sichtbar." },
  pending: { label: "In Prüfung", tone: "warning", hint: "Nur du siehst diesen Post, bis wir ihn freigeben." },
  rejected: { label: "Abgelehnt", tone: "danger", hint: "Dieser Post ist nicht öffentlich." },
  removed: { label: "Entfernt", tone: "danger", hint: "Die Moderation hat diesen Post entfernt." },
};

export type PostTileProps = {
  post: PostView;
  now: Date;
  deleteAction: (state: ConfirmState, formData: FormData) => Promise<ConfirmState>;
};

/**
 * Ein eigener Post im Studio: Titelbild (eigene Posts sind nie gesperrt), Prüfstatus, Sichtbarkeit,
 * Begründung bei Ablehnung/Entfernung und Löschen. Auf dem Handy als Zeile, ab `sm` als Karte.
 */
export function PostTile({ post, now, deleteAction }: PostTileProps) {
  const cover = post.media[0];
  const status = STATUS[post.moderationStatus];
  const at = post.publishedAt ?? post.createdAt;
  const caption = post.caption.trim();
  const label = caption ? `Post „${caption.slice(0, 40)}${caption.length > 40 ? "…" : ""}“` : `Post vom ${formatDateTime(at)}`;
  const flagged = post.moderationStatus === "rejected" || post.moderationStatus === "removed";

  return (
    <article
      aria-label={label}
      className={cn(
        "grid w-full min-w-0 grid-cols-[104px_minmax(0,1fr)] gap-3 rounded-card border bg-surface p-2 sm:flex sm:flex-col sm:gap-0 sm:p-0",
        flagged ? "border-danger/35" : "border-line",
      )}
    >
      <div className="relative aspect-[4/5] self-start overflow-hidden sm:self-stretch rounded-[calc(var(--radius-card)-2px)] bg-surface-2 sm:rounded-b-none sm:rounded-t-[calc(var(--radius-card)-1px)]">
        {cover ? (
          <img
            src={cover.url}
            width={cover.width}
            height={cover.height}
            alt={caption ? `Titelbild: ${caption.slice(0, 80)}` : "Titelbild des Posts"}
            loading="lazy"
            decoding="async"
            className={cn("absolute inset-0 size-full object-cover", post.moderationStatus === "removed" && "opacity-60 grayscale")}
          />
        ) : null}
        {post.mediaCount > 1 ? (
          <span className="absolute right-1.5 bottom-1.5 inline-flex items-center gap-1 rounded-[4px] bg-ink/75 px-1.5 py-0.5 font-mono text-[11px] text-canvas tabular-nums sm:right-2 sm:bottom-2">
            <Images aria-hidden className="size-3" />
            {post.mediaCount}
            <span className="sr-only"> Bilder</span>
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5 py-1 pr-1 sm:p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={status.tone} title={status.hint}>
            {status.label}
          </Badge>
          <Badge icon={post.visibility === "public" ? <Globe aria-hidden /> : <Lock aria-hidden />}>
            {post.visibility === "public" ? "Öffentlich" : "Nur Abonnenten"}
          </Badge>
        </div>

        {caption ? (
          <p className="line-clamp-2 text-sm leading-snug text-ink">{caption}</p>
        ) : (
          <p className="text-sm text-ink-faint italic">Ohne Text</p>
        )}

        {flagged ? (
          <div className="rounded-control border border-danger/30 bg-danger/5 px-2.5 py-2 text-[13px] leading-snug">
            <p className="font-medium text-ink">{post.moderationStatus === "rejected" ? "Begründung" : "Grund der Entfernung"}</p>
            <p className="mt-0.5 text-ink-muted">{post.moderationNote ?? status.hint}</p>
          </div>
        ) : post.moderationStatus === "pending" ? (
          <p className="text-[13px] leading-snug text-ink-muted">{status.hint}</p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <p className="font-mono text-[11.5px] whitespace-nowrap text-ink-faint tabular-nums">
            <time dateTime={at.toISOString()} title={formatDateTime(at)}>
              {post.publishedAt ? "" : "eingereicht "}
              {formatRelative(at, now)}
            </time>
          </p>
          <ConfirmActionButton
            action={deleteAction}
            trigger={
              <>
                <Trash2 aria-hidden />
                <span className="max-sm:sr-only">Löschen</span>
              </>
            }
            triggerLabel={`${label} löschen`}
            triggerClassName="-mr-1.5 text-ink-muted hover:text-danger"
            title="Post löschen?"
            description={
              post.moderationStatus === "approved"
                ? "Der Post verschwindet von deinem Profil und aus dem Feed deiner Abonnenten. Das lässt sich nicht rückgängig machen."
                : "Der Post wird endgültig aus deinem Studio entfernt. Das lässt sich nicht rückgängig machen."
            }
            confirmLabel="Ja, löschen"
            pendingLabel="Wird gelöscht …"
            cancelLabel="Behalten"
            successFocusId="inhalt"
          />
        </div>
      </div>
    </article>
  );
}

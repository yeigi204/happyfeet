import { ArrowDown, ArrowUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PostCard } from "@/components/posts/post-card";
import { Container } from "@/components/site/container";
import { FollowedCreators } from "@/components/site/followed-creators";
import { countLabel } from "@/components/site/text";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, formatNumber } from "@/lib/format";
import { requireOnboardedViewer } from "@/server/auth/viewer";
import { getFeed, isUuid } from "@/server/services/posts";
import { listMySubscriptions } from "@/server/services/subscriptions";

import { reportPostAction } from "../c/[handle]/actions";

export const metadata: Metadata = { title: "Feed" };

const PAGE_SIZE = 20;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Cursor aus der URL; Ungültiges wird ignoriert (dann erste Seite) statt einen Fehler zu zeigen. */
function parseCursor(rawBefore: string | undefined, rawBeforeId: string | undefined): { before?: Date; beforeId?: string } {
  if (!rawBefore) return {};
  const before = new Date(rawBefore);
  if (Number.isNaN(before.getTime())) return {};
  return rawBeforeId && isUuid(rawBeforeId) ? { before, beforeId: rawBeforeId } : { before };
}

export default async function FeedPage({ searchParams }: PageProps<"/feed">) {
  const viewer = await requireOnboardedViewer();
  const params = await searchParams;
  const cursor = parseCursor(first(params.before), first(params.beforeId));
  const paged = cursor.before !== undefined;

  // Einer mehr als angezeigt: verrät, ob es eine weitere Seite gibt.
  const [rows, subscriptions] = await Promise.all([
    getFeed(viewer, { limit: PAGE_SIZE + 1, ...cursor }),
    listMySubscriptions(viewer),
  ]);
  const posts = rows.slice(0, PAGE_SIZE);
  const last = posts.at(-1);
  const nextHref =
    rows.length > PAGE_SIZE && last
      ? `/feed?before=${encodeURIComponent((last.publishedAt ?? last.createdAt).toISOString())}&beforeId=${last.id}`
      : null;
  const active = subscriptions.filter((s) => s.active);
  const now = new Date();

  return (
    <Container className="py-10 sm:py-14">
      <PageHeader
        eyebrow={`Feed · ${countLabel(active.length, "Abo", "Abos", formatNumber)}`}
        title="Dein Feed"
        description="Neue Posts von den Creatorn, die du abonniert hast – die neusten zuerst."
      />

      <div className="mt-6">
        <FollowedCreators
          items={active.map((s) => ({ handle: s.creator.handle, displayName: s.creator.displayName, avatarUrl: s.creator.avatarUrl }))}
        />
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,660px)_320px] xl:justify-between">
        <div className="min-w-0">
          {paged ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-control border border-line bg-surface px-4 py-2.5 text-sm">
              <span className="text-ink-muted">Ältere Posts</span>
              <Link href="/feed" className="inline-flex items-center gap-1.5 font-medium text-ink underline-offset-4 hover:underline">
                <ArrowUp aria-hidden className="size-3.5" />
                Zu den neusten
              </Link>
            </div>
          ) : null}

          {posts.length === 0 ? (
            paged ? (
              <EmptyState
                title="Das war’s – du bist ganz unten."
                description="Weiter zurück gibt es keine Posts deiner Creator."
                action={
                  <ButtonLink href="/feed" variant="secondary" size="sm">
                    Zu den neusten Posts
                  </ButtonLink>
                }
              />
            ) : active.length === 0 ? (
              <EmptyState
                title="Dein Feed ist noch leer"
                description="Sobald du Creator abonnierst, landen ihre neuen Posts hier – in voller Auflösung, die neusten zuerst."
                action={
                  <ButtonLink href="/explore" variant="primary" size="sm">
                    Creator entdecken
                  </ButtonLink>
                }
              />
            ) : (
              <EmptyState
                title="Noch keine Posts"
                description="Deine Creator haben noch nichts veröffentlicht. Sobald es neue Bilder gibt, siehst du sie hier."
                action={
                  <ButtonLink href="/explore" variant="secondary" size="sm">
                    Weitere Creator entdecken
                  </ButtonLink>
                }
              />
            )
          ) : (
            <>
              <ol className="grid gap-6">
                {posts.map((post) => (
                  <li key={post.id}>
                    <PostCard post={post} variant="feed" now={now} reportAction={reportPostAction} />
                  </li>
                ))}
              </ol>
              <div className="mt-8 flex justify-center">
                {nextHref ? (
                  <ButtonLink href={nextHref} variant="secondary">
                    Mehr laden <ArrowDown aria-hidden />
                  </ButtonLink>
                ) : (
                  <p className="text-xs font-semibold text-ink-muted">Das waren alle Posts</p>
                )}
              </div>
            </>
          )}
        </div>

        <aside aria-label="Deine Abos" className="hidden lg:block">
          <div className="sticky top-8 rounded-card border border-line bg-surface shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <h2 className="text-[13px] font-semibold text-ink">Deine Abos</h2>
              <Link href="/subscriptions" className="text-[13px] text-ink-muted underline-offset-4 hover:text-ink hover:underline">
                Verwalten
              </Link>
            </div>
            {active.length === 0 ? (
              <p className="px-4 py-4 text-sm text-ink-muted">Noch keine laufenden Abos.</p>
            ) : (
              <ul className="divide-y divide-line">
                {active.map((sub) => (
                  <li key={sub.id}>
                    <Link href={`/c/${sub.creator.handle}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2">
                      <span aria-hidden>
                        <Avatar name={sub.creator.displayName} src={sub.creator.avatarUrl} size="sm" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{sub.creator.displayName}</span>
                        <span className="block truncate font-num text-[11px] text-ink-faint">@{sub.creator.handle}</span>
                      </span>
                      {sub.cancelAtPeriodEnd && sub.currentPeriodEnd ? (
                        <span className="shrink-0 font-num text-[11px] text-ink-faint" title="Gekündigt – Zugang bis zu diesem Datum">
                          bis {formatDate(sub.currentPeriodEnd)}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-line px-4 py-3">
              <Link href="/explore" className="text-[13px] font-medium text-ink underline-offset-4 hover:underline">
                Weitere Creator entdecken
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </Container>
  );
}

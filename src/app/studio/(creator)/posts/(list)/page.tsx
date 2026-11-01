import { CheckCircle2, Hourglass, Plus, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/site/container";
import { CREATED_PARAM } from "@/components/studio/new-post-state";
import { PostTile } from "@/components/studio/post-tile";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import type { ModerationStatus } from "@/lib/domain/types";
import { requireCreator } from "@/server/auth/viewer";
import { listMyPosts } from "@/server/services/posts";

import { deletePostAction } from "../actions";

export const metadata: Metadata = { title: "Deine Posts · Studio" };

const FILTERS: { key: ModerationStatus | "all"; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "approved", label: "Online" },
  { key: "pending", label: "In Prüfung" },
  { key: "rejected", label: "Abgelehnt" },
  { key: "removed", label: "Entfernt" },
];

const EMPTY_FILTER: Record<ModerationStatus, { title: string; description: string }> = {
  approved: { title: "Noch nichts online", description: "Sobald ein Post freigegeben ist, erscheint er hier und auf deinem Profil." },
  pending: { title: "Nichts in Prüfung", description: "Alle deine Posts sind geprüft. Neue Posts landen hier, solange die Vorab-Prüfung läuft." },
  rejected: { title: "Keine abgelehnten Posts", description: "Gut so. Abgelehnte Posts siehst du hier mit Begründung." },
  removed: { title: "Keine entfernten Posts", description: "Wenn die Moderation einen Post entfernt, steht er hier mit dem Grund." },
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StudioPostsPage({ searchParams }: PageProps<"/studio/posts">) {
  const viewer = await requireCreator();
  const params = await searchParams;
  const rawFilter = firstParam(params.status);
  const filter = FILTERS.some((f) => f.key === rawFilter) ? (rawFilter as ModerationStatus) : "all";
  const created = firstParam(params[CREATED_PARAM]);

  const now = new Date();
  const posts = await listMyPosts(viewer, { now });
  const counts = new Map<string, number>([["all", posts.length]]);
  for (const post of posts) counts.set(post.moderationStatus, (counts.get(post.moderationStatus) ?? 0) + 1);
  const shown = filter === "all" ? posts : posts.filter((post) => post.moderationStatus === filter);
  const approved = viewer.creator.verificationStatus === "approved";

  const tabs = FILTERS.filter((f) => f.key === "all" || f.key === filter || (counts.get(f.key) ?? 0) > 0).map((f) => ({
    href: f.key === "all" ? "/studio/posts" : `/studio/posts?status=${f.key}`,
    label: f.label,
    count: counts.get(f.key) ?? 0,
  }));
  const activeHref = filter === "all" ? "/studio/posts" : `/studio/posts?status=${filter}`;

  return (
    <Container className="py-8 sm:py-12">
      <PageHeader
        eyebrow="Studio · Posts"
        title="Deine Posts"
        description="Alles, was du hochgeladen hast – mit Prüfstatus. Deine Fans sehen nur, was online ist."
        actions={
          approved ? (
            <ButtonLink href="/studio/posts/new" variant="primary">
              <Plus aria-hidden />
              Neuer Post
            </ButtonLink>
          ) : null
        }
      />

      {created === "pending" || created === "approved" ? <CreatedNotice status={created} handle={viewer.handle} /> : null}

      {posts.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="Noch keine Posts"
          description={
            approved
              ? "Lade deine ersten Bilder hoch – bis zu 10 pro Post. Was du hier veröffentlichst, sehen deine Fans auf deinem Profil und im Feed."
              : "Sobald wir dein Profil freigegeben haben, kannst du hier deine ersten Bilder hochladen."
          }
          action={
            approved ? (
              <ButtonLink href="/studio/posts/new" variant="primary" size="sm">
                Ersten Post erstellen
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <Segmented items={tabs} active={activeHref} label="Posts filtern" />
          </div>
          {shown.length === 0 && filter !== "all" ? (
            <EmptyState className="mt-6" title={EMPTY_FILTER[filter].title} description={EMPTY_FILTER[filter].description} />
          ) : (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map((post) => (
                <li key={post.id} className="flex">
                  <PostTile post={post} now={now} deleteAction={deletePostAction.bind(null, post.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Container>
  );
}

function CreatedNotice({ status, handle }: { status: "pending" | "approved"; handle: string | null }) {
  const pending = status === "pending";
  const Icon = pending ? Hourglass : CheckCircle2;
  return (
    <div
      role="status"
      className={cn(
        "mt-6 flex items-start gap-3 rounded-card border p-4 animate-rise",
        pending ? "bg-warning-soft" : "bg-success-soft",
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", pending ? "text-warning" : "text-success")} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{pending ? "Dein Post ist eingegangen und wird geprüft." : "Dein Post ist online."}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">
          {pending
            ? "Wir schauen ihn uns vor der Veröffentlichung an. Sobald er freigegeben ist, sehen ihn deine Fans auf deinem Profil und im Feed."
            : "Deine Abonnenten sehen ihn ab sofort im Feed."}{" "}
          {!pending && handle ? (
            <Link href={`/c/${handle}`} className="font-medium text-ink underline underline-offset-4">
              Auf deinem Profil ansehen
            </Link>
          ) : null}
        </p>
      </div>
      <Link
        href="/studio/posts"
        aria-label="Hinweis ausblenden"
        className="-m-1 grid size-8 shrink-0 place-items-center rounded-control text-ink-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <X aria-hidden className="size-4" />
      </Link>
    </div>
  );
}

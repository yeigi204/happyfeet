import { Search, X } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { Container } from "@/components/site/container";
import { CreatorCard } from "@/components/site/creator-card";
import { countLabel } from "@/components/site/text";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { formatNumber } from "@/lib/format";
import { getViewer } from "@/server/auth/viewer";
import { listCreatorsForExplore } from "@/server/services/creators";

export const metadata: Metadata = {
  title: "Creator entdecken",
  description: "Alle freigeschalteten Creator auf happyfeet – mit Monatspreis, Abonnenten und Bio.",
};

const QUERY_MAX_LENGTH = 64;
const LIMIT = 60;

export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, QUERY_MAX_LENGTH) ?? "";
  const viewer = await getViewer();
  const creators = await listCreatorsForExplore(viewer, { query, limit: LIMIT });

  return (
    <Container className="py-10 sm:py-14">
      <PageHeader
        eyebrow={query ? "Entdecken · Suche" : `Entdecken · ${countLabel(creators.length, "Creator", "Creator", formatNumber)}`}
        title="Creator entdecken"
        description="Alle freigeschalteten Profile. Premium-Creator stehen oben, danach geht es nach Abonnenten."
        actions={
          <Form action="/explore" role="search" aria-label="Creator suchen" className="flex w-full gap-2 sm:w-auto">
            <label htmlFor="explore-q" className="sr-only">
              Name oder Handle
            </label>
            <span className="relative block w-full sm:w-72">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
              <Input
                id="explore-q"
                type="search"
                name="q"
                defaultValue={query}
                maxLength={QUERY_MAX_LENGTH}
                placeholder="Name oder @handle"
                autoComplete="off"
                enterKeyHint="search"
                className="pl-9"
              />
            </span>
            <Button type="submit" variant="secondary">
              Suchen
            </Button>
          </Form>
        }
      />

      {query && creators.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <p className="text-ink-muted" aria-live="polite">
            {countLabel(creators.length, "Treffer", "Treffer", formatNumber)} für{" "}
            <span className="font-medium text-ink">„{query}“</span>
          </p>
          <Link
            href="/explore"
            className="inline-flex items-center gap-1 rounded-control text-ink-muted underline-offset-4 hover:text-ink hover:underline"
          >
            <X aria-hidden className="size-3.5" />
            Suche zurücksetzen
          </Link>
        </div>
      ) : null}

      {creators.length === 0 ? (
        <EmptyState
          className="mt-8"
          title={query ? `Niemand gefunden für „${query}“` : "Noch keine Creator freigeschaltet"}
          description={
            query
              ? "Prüfe die Schreibweise oder suche nach einem Teil des Namens – zum Beispiel „zeh“ statt „zehenspiel“."
              : "Die ersten Profile sind in Prüfung. Schau bald wieder vorbei – oder werde selbst die erste Creatorin."
          }
          action={
            query ? (
              <ButtonLink href="/explore" variant="secondary" size="sm">
                Alle Creator zeigen
              </ButtonLink>
            ) : (
              <ButtonLink href="/studio/become-creator" variant="primary" size="sm">
                Creator werden
              </ButtonLink>
            )
          }
        />
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {creators.map((creator) => (
            <li key={creator.userId} className="flex">
              <CreatorCard creator={creator} className="w-full" />
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}

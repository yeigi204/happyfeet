import type { Metadata } from "next";

import { Container } from "@/components/site/container";
import { NewPostForm } from "@/components/studio/new-post-form";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireCreator } from "@/server/auth/viewer";
import { getPlatformSettings } from "@/server/services/settings";
import { getStudioStats } from "@/server/services/studio-stats";

import { createPostAction } from "./actions";

export const metadata: Metadata = { title: "Neuer Post · Studio" };

export default async function NewPostPage() {
  const viewer = await requireCreator();
  const status = viewer.creator.verificationStatus;

  if (status !== "approved") {
    return (
      <Container className="py-8 sm:py-12">
        <PageHeader eyebrow="Studio · Neuer Post" title="Neuer Post" />
        <EmptyState
          className="mt-8"
          title={status === "pending" ? "Posten geht nach der Freigabe los" : "Posten ist erst nach einer Freigabe möglich"}
          description={
            status === "pending"
              ? "Wir prüfen deine Bewerbung gerade. Sobald dein Profil freigegeben ist, kannst du hier Bilder hochladen – bis dahin bleibt deine Seite privat."
              : "Deine Bewerbung wurde abgelehnt. Bewirb dich mit angepassten Angaben erneut – nach der Freigabe kannst du hier posten."
          }
          action={
            status === "rejected" ? (
              <ButtonLink href="/studio/become-creator" variant="primary" size="sm">
                Erneut bewerben
              </ButtonLink>
            ) : (
              <ButtonLink href="/studio/settings" variant="secondary" size="sm">
                Bio &amp; Preis bearbeiten
              </ButtonLink>
            )
          }
        />
      </Container>
    );
  }

  const [stats, settings] = await Promise.all([getStudioStats(viewer), getPlatformSettings()]);
  const remaining = Math.max(0, settings.premoderationCount - stats.basic.postCount);

  return (
    <Container className="py-8 sm:py-12">
      <PageHeader
        eyebrow="Studio · Neuer Post"
        title="Neuer Post"
        description="Bis zu zehn Bilder und ein paar Worte dazu. Du entscheidest, ob alle den Post sehen oder nur deine Abonnenten."
      />
      <div className="mt-8">
        <NewPostForm
          action={createPostAction}
          premoderation={{ active: remaining > 0, remaining, total: settings.premoderationCount }}
        />
      </div>
    </Container>
  );
}

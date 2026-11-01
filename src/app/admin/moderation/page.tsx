import type { Metadata } from "next";

import { ModerationTriage } from "@/components/admin/moderation/triage";
import type { TriageItem, TriageMode, TriagePost } from "@/components/admin/moderation/types";
import { premoderationCopy } from "@/components/site/text";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { formatNumber } from "@/lib/format";
import { requireAdmin } from "@/server/auth/viewer";
import { listModerationQueue, type ModerationPost } from "@/server/services/admin/moderation";
import { getPlatformSettings } from "@/server/services/settings";

export const metadata: Metadata = { title: "Moderation" };

const HREFS: Record<TriageMode, string> = {
  premoderation: "/admin/moderation",
  reports: "/admin/moderation?tab=reports",
};

function toTriagePost(p: ModerationPost): TriagePost {
  return {
    id: p.id,
    caption: p.caption,
    visibility: p.visibility,
    moderationStatus: p.moderationStatus,
    createdAt: p.createdAt,
    deletedAt: p.deletedAt,
    creator: p.creator,
    media: p.media,
  };
}

export default async function ModerationPage({ searchParams }: PageProps<"/admin/moderation">) {
  const admin = await requireAdmin();
  const mode: TriageMode = (await searchParams).tab === "reports" ? "reports" : "premoderation";
  const [queue, settings] = await Promise.all([listModerationQueue(admin), getPlatformSettings()]);
  const now = new Date().getTime();

  const items: TriageItem[] =
    mode === "reports"
      ? queue.openReports.map((r) => ({
          key: `report:${r.id}`,
          kind: "report" as const,
          post: toTriagePost(r.post),
          report: {
            id: r.id,
            reason: r.reason,
            severity: r.severity,
            details: r.details,
            createdAt: r.createdAt,
            reporterHandle: r.reporter?.handle ?? null,
            openReportsOnPost: r.openReportsOnPost,
          },
        }))
      : queue.pendingPosts.map((p) => ({ key: `post:${p.id}`, kind: "post" as const, post: toTriagePost(p) }));

  const critical = queue.openReports.filter((r) => r.severity === "critical").length;
  const otherCount = mode === "reports" ? queue.pendingPosts.length : queue.openReports.length;
  const description =
    mode === "reports"
      ? critical > 0
        ? `${formatNumber(critical)} ${critical === 1 ? "kritische Meldung steht" : "kritische Meldungen stehen"} oben – mögliche Minderjährige und fehlendes Einverständnis zuerst.`
        : "Fan-Meldungen, die schwersten zuerst, dann die ältesten. Verwerfen, erledigen oder den Post entfernen."
      : premoderationCopy(
          settings.premoderationCount,
          {
            off: "Die Vorab-Prüfung ist ausgeschaltet – hier stehen nur noch früher eingereichte Posts, ältester zuerst.",
            one: "Den ersten Post neuer Creator prüfst du, bevor Fans ihn sehen – ältester zuerst.",
            many: (n) => `Die ersten ${n} Posts neuer Creator prüfst du, bevor Fans sie sehen – ältester zuerst.`,
          },
          formatNumber,
        );

  const empty =
    mode === "reports" ? (
      <EmptyState
        title="Keine offenen Meldungen"
        description="Alles erledigt. Neue Meldungen von Fans erscheinen hier – kritische ganz oben."
        action={
          otherCount > 0 ? (
            <ButtonLink href={HREFS.premoderation} size="sm">
              Vorab-Prüfung · {formatNumber(otherCount)}
            </ButtonLink>
          ) : undefined
        }
      />
    ) : (
      <EmptyState
        title="Vorab-Prüfung ist leer"
        description="Alle Posts sind geprüft. Neue Posts frischer Creator landen hier, der älteste zuerst."
        action={
          otherCount > 0 ? (
            <ButtonLink href={HREFS.reports} size="sm">
              Meldungen · {formatNumber(otherCount)}
            </ButtonLink>
          ) : undefined
        }
      />
    );

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Warteschlange · Inhalte"
        title="Moderation"
        description={description}
        actions={
          <Segmented
            label="Warteschlange"
            active={HREFS[mode]}
            items={[
              { href: HREFS.premoderation, label: "Vorab-Prüfung", count: queue.pendingPosts.length },
              { href: HREFS.reports, label: "Meldungen", count: queue.openReports.length },
            ]}
          />
        }
      />
      <ModerationTriage key={mode} mode={mode} items={items} now={now} premoderationCount={settings.premoderationCount} empty={empty} />
    </div>
  );
}

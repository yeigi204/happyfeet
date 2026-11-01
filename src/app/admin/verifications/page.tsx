import type { Metadata } from "next";

import { VerificationCard } from "@/components/admin/verifications/verification-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import type { VerificationStatus } from "@/lib/domain/types";
import { formatNumber } from "@/lib/format";
import { requireAdmin } from "@/server/auth/viewer";
import { listVerificationQueue } from "@/server/services/admin/verifications";

import { loadAdminDashboard } from "../_lib/data";

export const metadata: Metadata = { title: "Verifizierungen" };

const HREFS: Record<VerificationStatus, string> = {
  pending: "/admin/verifications",
  approved: "/admin/verifications?status=approved",
  rejected: "/admin/verifications?status=rejected",
};

const EMPTY: Record<VerificationStatus, { title: string; description: string }> = {
  pending: {
    title: "Keine offenen Anträge",
    description: "Alle Bewerbungen sind entschieden. Neue Anträge landen hier – der älteste zuerst.",
  },
  approved: { title: "Noch niemand freigegeben", description: "Freigegebene Creator erscheinen hier, die zuletzt entschiedenen zuerst." },
  rejected: { title: "Keine Ablehnungen", description: "Abgelehnte Anträge erscheinen hier – samt Begründung." },
};

function parseStatus(value: string | string[] | undefined): VerificationStatus {
  return value === "approved" || value === "rejected" ? value : "pending";
}

export default async function VerificationsPage({ searchParams }: PageProps<"/admin/verifications">) {
  const admin = await requireAdmin();
  const status = parseStatus((await searchParams).status);
  const [items, dashboard] = await Promise.all([listVerificationQueue(admin, { status }), loadAdminDashboard(admin)]);
  const now = new Date();
  const pendingCount = status === "pending" ? items.length : dashboard.queues.verifications.count;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Warteschlange · Creator-Anträge"
        title="Verifizierungen"
        description={
          pendingCount === 0
            ? "Keine offenen Anträge. Neue Creator warten hier auf deine Freigabe."
            : `${formatNumber(pendingCount)} ${pendingCount === 1 ? "Antrag wartet" : "Anträge warten"} – ältester zuerst. Prüfe Alter, Preis und Bio; abgelehnte Creator sehen deine Begründung.`
        }
        actions={
          <Segmented
            label="Status"
            active={HREFS[status]}
            items={[
              { href: HREFS.pending, label: "Offen", count: pendingCount },
              { href: HREFS.approved, label: "Freigegeben" },
              { href: HREFS.rejected, label: "Abgelehnt" },
            ]}
          />
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title={EMPTY[status].title}
          description={EMPTY[status].description}
          action={
            status === "pending" ? (
              <ButtonLink href="/admin/moderation" size="sm">
                Zur Moderation
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <ol className="grid gap-4" aria-label={`${items.length} Anträge`}>
          {items.map((item) => (
            <li key={item.userId}>
              <VerificationCard item={item} now={now} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";

import { ActivityFeed } from "@/components/admin/dashboard/activity-feed";
import { FeeMixCard } from "@/components/admin/dashboard/fee-mix-card";
import { KpiOverview } from "@/components/admin/dashboard/kpi-overview";
import { oldestLabel, QueueList, type DashboardQueues } from "@/components/admin/dashboard/queue-list";
import { TopCreators } from "@/components/admin/dashboard/top-creators";
import { urgencyFor } from "@/components/admin/lib/urgency";
import { AreaChart } from "@/components/charts/area-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime, formatNumber } from "@/lib/format";
import { requireAdmin } from "@/server/auth/viewer";
import { getPlatformSettings } from "@/server/services/settings";

import { loadAdminDashboard, loadUserDirectory } from "./_lib/data";

export const metadata: Metadata = { title: "Dashboard" };

type Focus = { lead: string; cta?: { href: string; label: string } };

/** Ein Satz, der sagt, was gerade zählt – plus der passende nächste Schritt. */
function focusFor(queues: DashboardQueues, now: Date): Focus {
  const { reports, verifications, premoderation } = queues;
  if (reports.criticalCount > 0) {
    return {
      lead:
        reports.criticalCount === 1
          ? "Eine kritische Meldung wartet – die zuerst, dann der Rest."
          : `${formatNumber(reports.criticalCount)} kritische Meldungen warten – die zuerst, dann der Rest.`,
      cta: { href: "/admin/moderation?tab=reports", label: "Meldungen prüfen" },
    };
  }
  const waiting = [
    { ...reports, href: "/admin/moderation?tab=reports", label: "Meldungen prüfen" },
    { ...verifications, href: "/admin/verifications", label: "Anträge prüfen" },
    { ...premoderation, href: "/admin/moderation", label: "Vorab-Prüfung öffnen" },
  ]
    .filter((q) => q.count > 0 && q.oldestAt)
    .sort((a, b) => a.oldestAt!.getTime() - b.oldestAt!.getTime());
  const oldest = waiting[0];
  if (!oldest) return { lead: "Alle Warteschlangen sind leer. Zeit für die Zahlen." };
  const urgent = urgencyFor(oldest.oldestAt, now) !== "ok";
  return {
    lead: urgent
      ? `Da wartet etwas zu lange: ${oldestLabel(oldest.oldestAt!, now)}.`
      : "Warteschlangen im Rahmen – erst abarbeiten, dann die Zahlen.",
    cta: { href: oldest.href, label: oldest.label },
  };
}

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();
  const [dashboard, settings, directory] = await Promise.all([loadAdminDashboard(admin), getPlatformSettings(), loadUserDirectory(admin)]);
  const now = new Date();
  const { kpis, queues, revenueDaily, subscriptionsDaily } = dashboard;
  const focus = focusFor(queues, now);
  const today = subscriptionsDaily.at(-1) ?? null;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={`Stand ${formatDateTime(now)}`}
        title="Dashboard"
        description={focus.lead}
        actions={
          focus.cta ? (
            <ButtonLink href={focus.cta.href} variant="primary" size="sm">
              {focus.cta.label}
              <ArrowRight aria-hidden />
            </ButtonLink>
          ) : null
        }
      />

      <KpiOverview kpis={kpis} activeSeries={subscriptionsDaily} today={today} now={now} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <AreaChart
            data={revenueDaily}
            series={[
              { key: "platformFeeRappen", label: "Plattform", color: "series-1" },
              { key: "creatorNetRappen", label: "Creator", color: "series-2" },
            ]}
            stacked
            format="chf"
            title="Umsatz · 90 Tage"
            height={300}
          />
        </Card>
        <QueueList queues={queues} now={now} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <BarChart
            data={subscriptionsDaily}
            series={[
              { key: "newSubs", label: "Neue Abos", color: "series-2" },
              { key: "canceledSubs", label: "Kündigungen", color: "series-1" },
            ]}
            mode="diverging"
            format="number"
            title="Neue Abos vs. Kündigungen · 90 Tage"
            height={260}
          />
        </Card>
        <FeeMixCard feeMix={dashboard.feeMix30d} settings={settings} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <TopCreators creators={dashboard.topCreators} />
        <ActivityFeed items={dashboard.activity} directory={directory} now={now} />
      </div>
    </div>
  );
}

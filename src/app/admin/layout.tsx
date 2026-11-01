import type { Metadata } from "next";

import { formatSignedNumber, formatSignedPercentPoints, directionOf } from "@/components/admin/lib/format-delta";
import { AdminShell, type TickerItem } from "@/components/admin/shell/admin-shell";
import { AdminToaster } from "@/components/admin/toast";
import { formatChf, formatNumber } from "@/lib/format";
import { requireAdmin } from "@/server/auth/viewer";

import { loadAdminDashboard } from "./_lib/data";
import { quickSearchAction } from "./actions";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · happyfeet" },
};

function pctItem(label: string, value: string, pct: number | null): TickerItem {
  const delta = formatSignedPercentPoints(pct);
  return delta ? { label, value, delta, direction: directionOf(pct ?? 0) } : { label, value };
}

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Der Proxy schützt keine Pfade: jede Admin-Seite steht hinter diesem Layout (Nicht-Admins → 404).
  const admin = await requireAdmin();
  const { kpis, queues, subscriptionsDaily } = await loadAdminDashboard(admin);
  const today = subscriptionsDaily.at(-1);

  const ticker: TickerItem[] = [
    pctItem("MRR", formatChf(kpis.mrrRappen), kpis.mrrDeltaPct),
    pctItem("Plattform-Umsatz 30 T", formatChf(kpis.platformRevenue30dRappen), kpis.platformRevenueDeltaPct),
    {
      label: "Aktive Abos",
      value: formatNumber(kpis.activeSubscriptions),
      delta: formatSignedNumber(kpis.activeSubscriptionsDelta30d),
      direction: directionOf(kpis.activeSubscriptionsDelta30d),
    },
    {
      // Kein `delta`: der Ticker zeigt dort eine Richtungs-Glyphe („unverändert“) – die kritischen gehören zum Wert.
      label: "Offene Meldungen",
      value:
        queues.reports.criticalCount > 0
          ? `${formatNumber(queues.reports.count)} · ${formatNumber(queues.reports.criticalCount)} kritisch`
          : formatNumber(queues.reports.count),
    },
    { label: "Brutto 30 T", value: formatChf(kpis.grossVolume30dRappen, { compact: true }) },
    { label: "Heute neu", value: formatNumber(today?.newSubs ?? 0) },
    { label: "Heute gekündigt", value: formatNumber(today?.canceledSubs ?? 0) },
  ];

  return (
    <AdminShell
      counts={{
        verifications: queues.verifications.count,
        moderation: queues.premoderation.count,
        reports: queues.reports.count,
      }}
      ticker={ticker}
      quickSearch={quickSearchAction}
    >
      {children}
      <AdminToaster />
    </AdminShell>
  );
}

import type { Metadata } from "next";

import { GeneratePayoutsButton, MarkPaidButton } from "@/components/admin/payouts/payout-buttons";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { Segmented } from "@/components/ui/segmented";
import { Stat } from "@/components/ui/stat";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatChf, formatDate, formatNumber } from "@/lib/format";
import { requireAdmin } from "@/server/auth/viewer";
import { getPayoutSummary, listPayoutsPage, type AdminPayoutRow } from "@/server/services/admin/payouts";

export const metadata: Metadata = { title: "Auszahlungen" };

type Status = AdminPayoutRow["status"];

const TABS: { value: Status; label: string; href: string }[] = [
  { value: "scheduled", label: "Geplant", href: "/admin/payouts" },
  { value: "paid", label: "Bezahlt", href: "/admin/payouts?status=paid" },
  { value: "failed", label: "Fehlgeschlagen", href: "/admin/payouts?status=failed" },
];

const EMPTY: Record<Status, { title: string; description: string }> = {
  scheduled: { title: "Nichts geplant", description: "Alle Auszahlungen sind bezahlt. «Fällige erzeugen» legt neue an, sobald eine Periode abgeschlossen ist." },
  paid: { title: "Noch nichts bezahlt", description: "Bezahlte Auszahlungen erscheinen hier, die neueste Periode zuerst." },
  failed: { title: "Keine Fehlschläge", description: "Gut so. Fehlgeschlagene Überweisungen würden hier zur Klärung auftauchen." },
};

const DAY_MS = 86_400_000;

/**
 * `period_end` ist exklusiv (Grenze 00:00 UTC). Letzter Tag = Ende minus einen halben Tag – sicher im
 * richtigen Kalendertag, auch in Europe/Zurich (UTC+1/+2), in der `formatDate` anzeigt.
 */
function periodLabel(p: AdminPayoutRow): string {
  return `${formatDate(p.periodStart)} – ${formatDate(new Date(p.periodEnd.getTime() - DAY_MS / 2))}`;
}

const PAGE_SIZE = 50;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Link auf eine Seite der Liste (Status bleibt, Seite 1 ohne Parameter). */
function pageHref(status: Status, page: number): string {
  const params = new URLSearchParams();
  if (status !== "scheduled") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/payouts?${query}` : "/admin/payouts";
}

export default async function PayoutsPage({ searchParams }: PageProps<"/admin/payouts">) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const raw = firstParam(query.status);
  const status: Status = raw === "paid" || raw === "failed" ? raw : "scheduled";
  const requestedPage = Number.parseInt(firstParam(query.page) ?? "1", 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const now = new Date();

  // Kopfzahlen und Tab-Zähler über alle Auszahlungen; die Tabelle lädt nur die aktuelle Seite.
  const [summary, list] = await Promise.all([
    getPayoutSummary(admin, { now }),
    listPayoutsPage(admin, { status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }, { now }),
  ]);
  const rows = list.items;
  const { scheduled, paid } = summary;
  const statusTotals: Record<Status, { count: number; totalRappen: number }> = { scheduled, paid, failed: summary.failed };
  const pageCount = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const firstRow = list.offset + 1;
  const lastRow = list.offset + rows.length;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Verwaltung · Geld an Creator"
        title="Auszahlungen"
        description="Premium-Creator bekommen ihr Guthaben wöchentlich, Standard-Creator monatlich. «Fällige erzeugen» erfasst abgeschlossene Perioden – doppelt geht nichts."
        actions={<GeneratePayoutsButton />}
      />

      <section aria-label="Übersicht" className="grid grid-cols-1 overflow-hidden rounded-card border border-line bg-surface sm:grid-cols-3 [&>*]:border-line [&>*]:p-5">
        <Stat
          className="border-b sm:border-r sm:border-b-0"
          label="Geplant"
          value={formatChf(scheduled.totalRappen)}
          hint={`${formatNumber(scheduled.count)} ${scheduled.count === 1 ? "Auszahlung" : "Auszahlungen"} · ${formatNumber(scheduled.creators)} Creator`}
        />
        <Stat
          className="border-b sm:border-r sm:border-b-0"
          label="Bezahlt · 30 T"
          value={formatChf(paid.last30d.totalRappen)}
          hint={`${formatNumber(paid.last30d.count)} ${paid.last30d.count === 1 ? "Überweisung" : "Überweisungen"}`}
        />
        <Stat
          label="Bezahlt · gesamt"
          value={formatChf(paid.totalRappen)}
          hint={paid.since ? `seit ${formatDate(paid.since)}` : "noch keine Überweisung"}
        />
      </section>

      <Segmented className="justify-self-start" label="Status" active={TABS.find((t) => t.value === status)!.href} items={TABS.map((t) => ({ href: t.href, label: t.label, count: statusTotals[t.value].count }))} />

      {rows.length === 0 && page === 1 ? (
        <EmptyState title={EMPTY[status].title} description={EMPTY[status].description} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Diese Seite ist leer"
          description={`Die Liste hat ${formatNumber(pageCount)} ${pageCount === 1 ? "Seite" : "Seiten"}.`}
          action={
            <ButtonLink href={pageHref(status, 1)} variant="secondary" size="sm">
              Zur ersten Seite
            </ButtonLink>
          }
        />
      ) : (
        <Card
          title={TABS.find((t) => t.value === status)!.label}
          action={<span className="font-num text-xs text-ink-faint tabular-nums">Summe {formatChf(statusTotals[status].totalRappen)}</span>}
          flush
        >
          <Table>
            <THead>
              <TR>
                <TH>Creator</TH>
                <TH className="hidden md:table-cell">Rhythmus</TH>
                <TH className="hidden sm:table-cell">Periode</TH>
                <TH numeric>Betrag</TH>
                <TH className="hidden sm:table-cell">{status === "paid" ? "Bezahlt" : "Erstellt"}</TH>
                {status === "scheduled" ? (
                  <TH className="text-right">
                    <span className="sr-only">Aktion</span>
                  </TH>
                ) : null}
              </TR>
            </THead>
            <TBody>
              {rows.map((p) => {
                const name = p.creator.displayName ?? p.creator.handle ?? "Unbekannt";
                const creatorLabel = p.creator.handle ? `@${p.creator.handle}` : name;
                return (
                  <TR key={p.id}>
                    <TD>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={name} size="sm" className="max-sm:hidden" />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-[13.5px] font-medium">
                            <span className="truncate">{name}</span>
                            {p.creator.isPremium ? <PremiumBadge compact /> : null}
                          </span>
                          {p.creator.handle ? <span className="block truncate font-num text-[11px] text-ink-faint">@{p.creator.handle}</span> : null}
                          <span className="block font-num text-[11px] whitespace-nowrap text-ink-muted tabular-nums sm:hidden">{periodLabel(p)}</span>
                        </span>
                      </span>
                    </TD>
                    <TD className="hidden md:table-cell">
                      <Badge>{p.schedule === "weekly" ? "Wöchentlich" : "Monatlich"}</Badge>
                    </TD>
                    <TD className="hidden font-num text-[13px] whitespace-nowrap text-ink-muted tabular-nums sm:table-cell">{periodLabel(p)}</TD>
                    <TD numeric className="font-medium">
                      {formatChf(p.amountRappen)}
                    </TD>
                    <TD className="hidden font-num text-[13px] text-ink-muted tabular-nums sm:table-cell">
                      {status === "paid" && p.paidAt ? formatDate(p.paidAt) : formatDate(p.createdAt)}
                    </TD>
                    {status === "scheduled" ? (
                      <TD className="text-right">
                        <MarkPaidButton payoutId={p.id} amountRappen={p.amountRappen} creatorLabel={creatorLabel} periodLabel={periodLabel(p)} />
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {pageCount > 1 ? (
            <nav aria-label="Seiten" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
              <p className="font-num text-xs text-ink-faint tabular-nums">
                {formatNumber(firstRow)}–{formatNumber(lastRow)} von {formatNumber(list.total)}
              </p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <ButtonLink href={pageHref(status, page - 1)} variant="secondary" size="sm">
                    Zurück
                  </ButtonLink>
                ) : null}
                {page < pageCount ? (
                  <ButtonLink href={pageHref(status, page + 1)} variant="secondary" size="sm">
                    Weiter
                  </ButtonLink>
                ) : null}
              </div>
            </nav>
          ) : null}
        </Card>
      )}
    </div>
  );
}

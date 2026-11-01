import { ArrowRight, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Container } from "@/components/site/container";
import { StatCell, StatGrid } from "@/components/studio/stat-grid";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { feeBpsForPlan } from "@/lib/domain/fees";
import type { PayoutSchedule } from "@/lib/domain/types";
import { formatChf, formatDate, formatPercentBps } from "@/lib/format";
import { requireCreator } from "@/server/auth/viewer";
import type { Payout } from "@/server/db/schema";
import { getCreatorBalance, listCreatorPayouts } from "@/server/services/payouts";
import { getPlatformSettings } from "@/server/services/settings";

export const metadata: Metadata = { title: "Auszahlungen · Studio" };

const DAY_MS = 24 * 60 * 60 * 1000;

const SCHEDULE: Record<PayoutSchedule, { label: string; adjective: string }> = {
  weekly: { label: "Wöchentlich", adjective: "wöchentlich" },
  monthly: { label: "Monatlich", adjective: "monatlich" },
};

// „Geplant“ ist der Normalfall, kein Warnzustand – neutral mit Uhr statt Warndreieck.
const STATUS: Record<Payout["status"], { label: string; tone: "neutral" | "success" | "danger"; icon?: ReactNode }> = {
  scheduled: { label: "Geplant", tone: "neutral", icon: <Clock aria-hidden className="text-ink-muted" /> },
  paid: { label: "Bezahlt", tone: "success" },
  failed: { label: "Fehlgeschlagen", tone: "danger" },
};

/** Periodenende ist die (exklusive) Grenze um Mitternacht UTC – angezeigt wird der letzte enthaltene Tag. */
function periodLabel(payout: Payout): string {
  return `${formatDate(payout.periodStart)} – ${formatDate(new Date(payout.periodEnd.getTime() - DAY_MS))}`;
}

export default async function StudioPayoutsPage() {
  const viewer = await requireCreator();
  const now = new Date();
  const [balance, payouts, settings] = await Promise.all([
    getCreatorBalance(viewer, { now }),
    listCreatorPayouts(viewer, { now }),
    getPlatformSettings(),
  ]);
  const premium = balance.schedule === "weekly";
  const feeBps = feeBpsForPlan(premium ? "premium" : "standard", settings);
  const share = formatPercentBps(10_000 - feeBps);
  const next = formatDate(balance.nextPayoutDate);
  const days = Math.max(1, Math.ceil((balance.nextPayoutDate.getTime() - now.getTime()) / DAY_MS));

  return (
    <Container className="py-8 sm:py-12">
      <PageHeader
        eyebrow="Studio · Auszahlungen"
        title="Auszahlungen"
        description={`Von jedem Abo gehen ${share} an dich. ${SCHEDULE[balance.schedule].label} fassen wir dein Guthaben zu einer Auszahlung zusammen – nächster Stichtag ist der ${next}.`}
      />

      <StatGrid label="Guthaben" className="mt-8 grid-cols-1 min-[440px]:grid-cols-2 lg:grid-cols-4">
        <StatCell>
          <Stat
            label="Verfügbar"
            value={formatChf(balance.availableRappen)}
            hint={balance.availableRappen > 0 ? `wird am ${next} verplant` : "gerade nichts offen"}
          />
        </StatCell>
        <StatCell>
          <Stat
            label="Geplant"
            value={formatChf(balance.scheduledRappen)}
            hint={balance.scheduledRappen > 0 ? "Überweisung folgt" : "nichts unterwegs"}
          />
        </StatCell>
        <StatCell>
          <Stat label="Ausbezahlt" value={formatChf(balance.paidRappen)} hint="seit Beginn" />
        </StatCell>
        <StatCell>
          {/* Stichtag = nächste Abrechnung des verfügbaren Guthabens; bereits geplante Beträge sind schon unterwegs. */}
          <Stat label="Nächster Stichtag" value={next} hint={`${days === 1 ? "morgen" : `in ${days} Tagen`} · ${SCHEDULE[balance.schedule].adjective}`} />
        </StatCell>
      </StatGrid>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <section aria-labelledby="payout-history-title" className="min-w-0">
          <h2 id="payout-history-title" className="mb-4 font-display text-2xl leading-none font-bold tracking-[-0.03em] text-ink">
            Verlauf
          </h2>
          {payouts.length === 0 ? (
            <EmptyState
              title="Noch keine Auszahlungen"
              description={
                balance.availableRappen > 0
                  ? `Dein Guthaben von ${formatChf(balance.availableRappen)} fassen wir am ${next} zur ersten Auszahlung zusammen.`
                  : "Sobald Fans dich abonnieren, sammelt sich hier dein Guthaben – die erste Auszahlung folgt am nächsten Stichtag."
              }
            />
          ) : (
            <Card flush>
              <Table>
                <caption className="sr-only">Deine Auszahlungen, neueste zuerst</caption>
                <THead>
                  <TR>
                    <TH>Zeitraum</TH>
                    <TH className="max-sm:hidden">Rhythmus</TH>
                    <TH>Status</TH>
                    <TH numeric>Betrag</TH>
                    <TH numeric className="max-md:hidden">
                      Bezahlt am
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {payouts.map((payout) => (
                    <TR key={payout.id}>
                      <TD className="font-num text-[12.5px] text-ink-muted tabular-nums">{periodLabel(payout)}</TD>
                      <TD className="text-ink-muted max-sm:hidden">{SCHEDULE[payout.schedule].label}</TD>
                      <TD>
                        <Badge tone={STATUS[payout.status].tone} icon={STATUS[payout.status].icon}>
                          {STATUS[payout.status].label}
                        </Badge>
                      </TD>
                      <TD numeric className="font-medium">
                        {formatChf(payout.amountRappen)}
                      </TD>
                      <TD numeric className="text-ink-muted max-md:hidden">
                        {payout.paidAt ? formatDate(payout.paidAt) : "–"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
        </section>

        <aside aria-labelledby="payout-how-title" className="rounded-card border border-line bg-surface p-5 lg:mt-10">
          <h2 id="payout-how-title" className="text-[13px] font-semibold text-ink">
            So kommt das Geld zu dir
          </h2>
          <ol className="mt-4 grid gap-4 text-sm leading-relaxed text-ink-muted">
            <li className="grid grid-cols-[22px_minmax(0,1fr)] gap-2">
              <span aria-hidden className="font-num text-[11px] leading-6 text-ink-faint">01</span>
              <span>
                Ein Fan zahlt sein Abo – dein Anteil von <span className="text-ink">{share}</span> landet sofort im verfügbaren Guthaben.
              </span>
            </li>
            <li className="grid grid-cols-[22px_minmax(0,1fr)] gap-2">
              <span aria-hidden className="font-num text-[11px] leading-6 text-ink-faint">02</span>
              <span>
                {premium ? "Jeden Montag" : "Am 1. jedes Monats"} fassen wir dein Guthaben bis zu diesem Stichtag zu einer geplanten Auszahlung zusammen.
              </span>
            </li>
            <li className="grid grid-cols-[22px_minmax(0,1fr)] gap-2">
              <span aria-hidden className="font-num text-[11px] leading-6 text-ink-faint">03</span>
              <span>Unser Team überweist sie. Danach steht sie hier als bezahlt.</span>
            </li>
          </ol>
          {!premium ? (
            <Link
              href="/studio/premium"
              className="group mt-5 flex items-center justify-between gap-3 border-t border-line pt-4 text-sm font-medium text-ink"
            >
              Mit Premium jede Woche ausbezahlt
              <ArrowRight aria-hidden className="size-4 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </Link>
          ) : null}
        </aside>
      </div>
    </Container>
  );
}

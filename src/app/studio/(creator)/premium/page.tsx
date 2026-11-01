import { Check, CheckCircle2, Minus } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Meter } from "@/components/charts/meter";
import { Container } from "@/components/site/container";
import { ConfirmActionButton } from "@/components/studio/confirm-action-button";
import { UpgradeButton } from "@/components/studio/premium-actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { PageHeader } from "@/components/ui/page-header";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { Stat } from "@/components/ui/stat";
import { splitPayment } from "@/lib/domain/fees";
import { formatChf, formatDate, formatNumber, formatPercentBps } from "@/lib/format";
import { requireCreator } from "@/server/auth/viewer";
import { getMyCreatorProfile } from "@/server/services/creators";
import { getPremiumStatus } from "@/server/services/premium";
import { countActiveSubscribers } from "@/server/services/studio-stats";

import { cancelPremiumAction, startPremiumCheckoutAction } from "./actions";

export const metadata: Metadata = { title: "Premium · Studio" };

export default async function StudioPremiumPage({ searchParams }: PageProps<"/studio/premium">) {
  const viewer = await requireCreator();
  const okParam = (await searchParams).ok;
  const justPaid = (Array.isArray(okParam) ? okParam[0] : okParam) === "1";
  const now = new Date();
  const [premium, profile, subs] = await Promise.all([
    getPremiumStatus(viewer, { now }),
    getMyCreatorProfile(viewer),
    countActiveSubscribers(viewer, { now }),
  ]);
  const approved = viewer.creator.verificationStatus === "approved";

  const price = profile?.monthlyPriceRappen ?? 0;
  const standard = splitPayment(price, premium.standardFeeBps);
  const withPremium = splitPayment(price, premium.premiumFeeBps);
  const gainPerSub = withPremium.creatorNetRappen - standard.creatorNetRappen;
  const breakEven = gainPerSub > 0 ? Math.ceil(premium.priceRappen / gainPerSub) : null;
  const monthlyEffect = subs * gainPerSub - premium.priceRappen;

  const rows: { label: string; standard: ReactNode; premium: ReactNode }[] = [
    { label: "Preis", standard: "kostenlos", premium: `${formatChf(premium.priceRappen)} / Monat` },
    { label: "Provision pro Abo", standard: formatPercentBps(premium.standardFeeBps), premium: formatPercentBps(premium.premiumFeeBps) },
    { label: "Auszahlung", standard: "monatlich", premium: "wöchentlich" },
    { label: "Premium-Badge auf Profil und Karten", standard: false, premium: true },
    { label: "Vorrang beim Entdecken", standard: false, premium: true },
    { label: "Erweiterte Statistik: 90 Tage, MRR, Kündigungsrate", standard: false, premium: true },
  ];

  return (
    <Container className="py-8 sm:py-12">
      <PageHeader
        eyebrow="Studio · Premium"
        title={premium.isPremium ? "Du bist Premium" : "Premium für Creator"}
        description={
          premium.isPremium
            ? "Weniger Provision, schnellere Auszahlung und der volle Überblick – solange dein Premium läuft."
            : `Für ${formatChf(premium.priceRappen)} im Monat behältst du mehr von jedem Abo, wirst öfter ausbezahlt und siehst genauer, was bei dir passiert.`
        }
      />

      {justPaid && !premium.cancelAtPeriodEnd ? (
        <div
          role="status"
          className={cn(
            "mt-6 flex items-start gap-3 rounded-card border p-4 animate-rise",
            premium.isPremium ? "border-success/35 bg-success/10" : "border-warning/40 bg-warning/10",
          )}
        >
          <CheckCircle2 aria-hidden className={cn("mt-0.5 size-5 shrink-0", premium.isPremium ? "text-success" : "text-warning")} />
          <p className="text-sm leading-relaxed text-ink">
            {premium.isPremium ? (
              <>
                <span className="font-medium">Willkommen bei Premium.</span> Ab sofort gilt {formatPercentBps(premium.premiumFeeBps)} Provision auf neue
                Zahlungen, und deine erweiterte Statistik ist in der Übersicht freigeschaltet.
              </>
            ) : (
              <>
                <span className="font-medium">Danke für deine Zahlung.</span> Wir schalten Premium frei, sobald die Bestätigung des Zahlungsanbieters
                da ist – das dauert meist nur einen Moment.
              </>
            )}
          </p>
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
        <div className="grid gap-6">
          {/* ─── Status / Upgrade ─── */}
          <section aria-label="Dein Plan" className="rounded-card border border-line bg-surface p-5 sm:p-7">
            {premium.isPremium && premium.currentPeriodEnd ? (
              <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PremiumBadge />
                    {premium.cancelAtPeriodEnd ? <Badge tone="warning">Gekündigt</Badge> : <Badge tone="success">Aktiv</Badge>}
                  </div>
                  <p className="mt-4 font-display text-2xl leading-tight font-bold tracking-[-0.03em] text-ink">
                    {premium.cancelAtPeriodEnd
                      ? `Deine Vorteile laufen bis zum ${formatDate(premium.currentPeriodEnd)}.`
                      : `Verlängert sich am ${formatDate(premium.currentPeriodEnd)}.`}
                  </p>
                  <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-muted">
                    {premium.cancelAtPeriodEnd
                      ? `Danach gilt wieder der Standard-Plan mit ${formatPercentBps(premium.standardFeeBps)} Provision und monatlicher Auszahlung. Ab dann kannst du Premium jederzeit neu buchen.`
                      : `Für ${formatChf(premium.priceRappen)} pro Monat. Kündigen kannst du jederzeit – die bezahlte Zeit bleibt dir.`}
                  </p>
                </div>
                {!premium.cancelAtPeriodEnd ? (
                  <ConfirmActionButton
                    action={cancelPremiumAction}
                    trigger="Premium kündigen"
                    triggerVariant="secondary"
                    triggerSize="md"
                    title="Premium kündigen?"
                    description={
                      <>
                        Premium verlängert sich nicht mehr. Bis zum <span className="font-num text-ink">{formatDate(premium.currentPeriodEnd)}</span>{" "}
                        behältst du alle Vorteile, danach gelten wieder {formatPercentBps(premium.standardFeeBps)} Provision und monatliche
                        Auszahlungen.
                      </>
                    }
                    confirmLabel="Ja, kündigen"
                    pendingLabel="Wird gekündigt …"
                    cancelLabel="Premium behalten"
                    successFocusId="inhalt"
                  />
                ) : null}
              </div>
            ) : (
              <div className="grid gap-5">
                <div>
                  <Stat size="lg" label="Dein Plan: Standard · Premium kostet" value={formatChf(premium.priceRappen)} hint="pro Monat" />
                  <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-muted">
                    Monatlich kündbar. Nach dem Kauf gilt der tiefere Satz sofort für jede neue Zahlung deiner Fans.
                  </p>
                </div>
                {approved ? (
                  <UpgradeButton action={startPremiumCheckoutAction} label="Premium buchen" />
                ) : (
                  <p className="rounded-control border border-line bg-surface-2/60 px-3.5 py-3 text-sm text-ink-muted">
                    Premium kannst du buchen, sobald dein Profil freigegeben ist.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* ─── Vergleich ─── */}
          <Card title="Standard und Premium im Vergleich" flush>
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Vorteile von Standard und Premium</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="eyebrow h-10 px-4 text-left font-normal">
                    <span className="sr-only">Leistung</span>
                  </th>
                  <PlanHead label="Standard" current={!premium.isPremium} />
                  <PlanHead label="Premium" current={premium.isPremium} premium />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-b border-line last:border-0">
                    <th scope="row" className="px-4 py-3 text-left font-normal text-ink">
                      {row.label}
                    </th>
                    <PlanCell value={row.standard} current={!premium.isPremium} />
                    <PlanCell value={row.premium} current={premium.isPremium} premium />
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        {/* ─── Rechenbeispiel ─── */}
        <Card title="Rechenbeispiel mit deinem Preis" className="lg:sticky lg:top-24">
          {price > 0 ? (
            <div className="grid gap-6">
              <p className="text-sm leading-relaxed text-ink-muted">
                Ein Abo bei dir kostet <span className="font-num text-ink">{formatChf(price)}</span> im Monat. So teilt es sich auf:
              </p>
              <Meter
                title={`Standard · ${formatPercentBps(premium.standardFeeBps)}`}
                format="chf"
                parts={[
                  { label: "Du", value: standard.creatorNetRappen, color: "series-2" },
                  { label: "Provision", value: standard.platformFeeRappen, color: "series-1" },
                ]}
              />
              <Meter
                title={`Premium · ${formatPercentBps(premium.premiumFeeBps)}`}
                format="chf"
                parts={[
                  { label: "Du", value: withPremium.creatorNetRappen, color: "series-2" },
                  { label: "Provision", value: withPremium.platformFeeRappen, color: "series-1" },
                ]}
              />
              <dl className="grid gap-2 border-t border-line pt-4 font-num text-[13px] tabular-nums">
                <div className="flex justify-between gap-4">
                  <dt className="font-sans text-ink-muted">Mehr pro Abo und Monat</dt>
                  <dd className="font-medium text-ink">+{formatChf(gainPerSub)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="font-sans text-ink-muted">Premium lohnt sich ab</dt>
                  <dd className="font-medium text-ink">{breakEven !== null ? `${formatNumber(breakEven)} Abos` : "–"}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-line pt-2">
                  <dt className="font-sans text-ink-muted">{subs === 1 ? "Bei deinem einen Abonnenten" : `Bei deinen ${formatNumber(subs)} Abonnenten`}</dt>
                  <dd className={cn("font-medium", monthlyEffect >= 0 ? "text-success" : "text-ink")}>
                    {monthlyEffect >= 0 ? "+" : ""}
                    {formatChf(monthlyEffect)}
                  </dd>
                </div>
              </dl>
              <p className="-mt-3 text-xs leading-relaxed text-ink-faint">
                Pro Monat, nach Abzug der Premium-Gebühr von {formatChf(premium.priceRappen)}. Badge, Vorrang beim Entdecken und wöchentliche Auszahlung
                kommen dazu.
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Lege in den Einstellungen einen Monatspreis fest, dann rechnen wir es dir hier vor.</p>
          )}
        </Card>
      </div>
    </Container>
  );
}

function PlanHead({ label, current, premium }: { label: string; current: boolean; premium?: boolean }) {
  return (
    <th scope="col" className={cn("h-10 w-[27%] px-3 text-left align-middle font-normal", current && "bg-surface-2/70")}>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn("text-[13px] font-semibold", premium ? "text-premium" : "text-ink")}>{label}</span>
        {current ? <span className="font-num text-[10px] tracking-[0.08em] text-ink-faint uppercase">Dein Plan</span> : null}
      </span>
    </th>
  );
}

function PlanCell({ value, current, premium }: { value: ReactNode; current: boolean; premium?: boolean }) {
  let content: ReactNode = value;
  if (value === true) {
    content = (
      <>
        <Check aria-hidden className={cn("size-4", premium ? "text-premium" : "text-success")} />
        <span className="sr-only">inklusive</span>
      </>
    );
  } else if (value === false) {
    content = (
      <>
        <Minus aria-hidden className="size-4 text-ink-faint" />
        <span className="sr-only">nicht enthalten</span>
      </>
    );
  }
  return (
    <td className={cn("px-3 py-3 align-middle font-num text-[13px] text-ink tabular-nums", current && "bg-surface-2/70")}>{content}</td>
  );
}

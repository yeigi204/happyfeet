import { Check, CircleDashed, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { AreaChart } from "@/components/charts/area-chart";
import { BarChart } from "@/components/charts/bar-chart";
import type { DatumRow } from "@/components/charts/types";
import { Container } from "@/components/site/container";
import { PremiumTeaser } from "@/components/studio/premium-teaser";
import { StatCell, StatGrid } from "@/components/studio/stat-grid";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { PageHeader } from "@/components/ui/page-header";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { Stat, type StatDelta } from "@/components/ui/stat";
import { formatChf, formatDate, formatNumber, formatPercent } from "@/lib/format";
import type { CreatorViewer } from "@/server/auth/guards";
import { requireCreator } from "@/server/auth/viewer";
import { getMyCreatorProfile } from "@/server/services/creators";
import { getPlatformSettings } from "@/server/services/settings";
import { getStudioStats, type StudioStats } from "@/server/services/studio-stats";

export const metadata: Metadata = { title: "Studio" };

const SCHEDULE_LABEL = { weekly: "wöchentlich", monthly: "monatlich" } as const;

export default async function StudioOverviewPage() {
  const viewer = await requireCreator();
  const now = new Date();
  const [stats, profile, settings] = await Promise.all([
    getStudioStats(viewer, { now }),
    getMyCreatorProfile(viewer),
    getPlatformSettings(),
  ]);
  const approved = viewer.creator.verificationStatus === "approved";
  const { basic } = stats;

  return (
    <Container className="py-8 sm:py-12">
      <PageHeader
        eyebrow={`Studio · ${formatDate(now)}`}
        title="Übersicht"
        description={headline(viewer, stats)}
        actions={
          approved ? (
            <ButtonLink href="/studio/posts/new" variant="primary">
              <Plus aria-hidden />
              Neuer Post
            </ButtonLink>
          ) : null
        }
      />

      {!approved ? (
        <div className="mt-8">
          <NextSteps rejected={viewer.creator.verificationStatus === "rejected"} premoderationCount={settings.premoderationCount} />
        </div>
      ) : null}

      <StatGrid label="Kennzahlen" className={cn("grid-cols-1 min-[440px]:grid-cols-2 lg:grid-cols-3", approved ? "mt-8" : "mt-12")}>
        <StatCell>
          <Stat
            label="Aktive Abonnenten"
            value={formatNumber(basic.activeSubscribers)}
            hint={basic.activeSubscribers === 0 ? "noch niemand" : "mit laufendem Zugang"}
          />
        </StatCell>
        <StatCell>
          <Stat label="Netto diesen Monat" value={formatChf(basic.netThisMonthRappen)} hint={`brutto ${formatChf(basic.grossThisMonthRappen)}`} />
        </StatCell>
        <StatCell>
          <Stat
            label="Guthaben"
            value={formatChf(basic.balance.availableRappen)}
            hint={basic.balance.scheduledRappen > 0 ? `+ ${formatChf(basic.balance.scheduledRappen)} geplant` : "noch nicht verplant"}
          />
        </StatCell>
        <StatCell>
          <Stat
            label="Nächste Auszahlung"
            value={formatDate(basic.balance.nextPayoutDate)}
            hint={
              <Link href="/studio/payouts" className="rounded-control underline-offset-4 hover:text-ink hover:underline">
                {SCHEDULE_LABEL[basic.balance.schedule]}
              </Link>
            }
          />
        </StatCell>
        <StatCell>
          <Stat
            label="Posts"
            value={formatNumber(basic.postCount)}
            hint={
              <Link href="/studio/posts" className="rounded-control underline-offset-4 hover:text-ink hover:underline">
                freigegeben
              </Link>
            }
          />
        </StatCell>
        <StatCell>
          <Stat
            label="Posts in Prüfung"
            value={formatNumber(basic.pendingPostCount)}
            hint={
              basic.pendingPostCount > 0 ? (
                <Link href="/studio/posts?status=pending" className="rounded-control underline-offset-4 hover:text-ink hover:underline">
                  warten auf Freigabe
                </Link>
              ) : (
                "nichts offen"
              )
            }
          />
        </StatCell>
      </StatGrid>

      {approved ? (
        <div className="mt-10">
          {stats.advanced ? (
            <AdvancedStats advanced={stats.advanced} />
          ) : (
            <PremiumTeaser
              priceRappen={profile?.monthlyPriceRappen ?? settings.minPriceRappen}
              standardFeeBps={settings.standardFeeBps}
              premiumFeeBps={settings.premiumFeeBps}
              premiumPriceRappen={settings.premiumPriceRappen}
            />
          )}
        </div>
      ) : null}
    </Container>
  );
}

function headline(viewer: CreatorViewer, stats: StudioStats): string {
  const name = viewer.displayName?.split(/\s+/)[0] ?? viewer.handle ?? "";
  const greeting = name ? `Hallo ${name}. ` : "";
  if (viewer.creator.verificationStatus !== "approved") return `${greeting}Hier siehst du, wie es mit deinem Profil weitergeht.`;
  const subs = stats.basic.activeSubscribers;
  const subsText = subs === 1 ? "1 Fan hat" : `${formatNumber(subs)} Fans haben`;
  return `${greeting}${subsText} gerade Zugang zu deinen Posts. Die nächste Auszahlung ist am ${formatDate(stats.basic.balance.nextPayoutDate)}.`;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function percentDelta(current: number, previous: number): StatDelta | undefined {
  if (previous === 0) return undefined;
  const ratio = current / previous - 1;
  const direction = Math.abs(ratio) < 0.0005 ? "flat" : ratio > 0 ? "up" : "down";
  return { value: `${ratio > 0 ? "+" : ""}${formatPercent(ratio, 1)}`, direction };
}

function AdvancedStats({ advanced }: { advanced: NonNullable<StudioStats["advanced"]> }) {
  const daily = advanced.daily;
  const net = daily.map((d) => ({ date: d.date, net: d.netRappen })) as DatumRow[];
  const last30 = daily.slice(-30);
  const subs = last30.map((d) => ({ date: d.date, newSubs: d.newSubs, canceledSubs: d.canceledSubs })) as DatumRow[];
  const net30 = sum(last30.map((d) => d.netRappen));
  const netPrev30 = sum(daily.slice(-60, -30).map((d) => d.netRappen));
  const new30 = sum(last30.map((d) => d.newSubs));
  const canceled30 = sum(last30.map((d) => d.canceledSubs));

  return (
    <section aria-labelledby="advanced-title">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 id="advanced-title" className="font-display text-2xl leading-none font-bold tracking-[-0.03em] text-ink">
          Erweiterte Statistik
        </h2>
        <PremiumBadge />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <AreaChart data={net} series={[{ key: "net", label: "Netto", color: "series-1" }]} format="chf" title="Netto-Einnahmen · 90 Tage" height={280} />
        </Card>
        <StatGrid label="Abo-Kennzahlen" className="grid-cols-1 min-[440px]:grid-cols-2 lg:grid-cols-1">
          <StatCell>
            <Stat label="MRR" value={formatChf(advanced.mrrRappen)} hint="laufende, nicht gekündigte Abos" />
          </StatCell>
          <StatCell>
            <Stat label="Kündigungsrate 30 T" value={formatPercent(advanced.churnRate30d, 1)} hint="tiefer ist besser" />
          </StatCell>
          <StatCell className="max-lg:min-[440px]:col-span-2">
            <Stat label="Netto 30 T" value={formatChf(net30)} delta={percentDelta(net30, netPrev30)} hint="vs. 30 Tage davor" />
          </StatCell>
        </StatGrid>
        <Card className="lg:col-span-3">
          <BarChart
            data={subs}
            series={[
              { key: "newSubs", label: "Neue Abos", color: "series-2" },
              { key: "canceledSubs", label: "Kündigungen", color: "series-1" },
            ]}
            mode="diverging"
            format="number"
            title="Neue Abos vs. Kündigungen · 30 Tage"
          />
          <p className="mt-3 border-t border-line pt-3 font-mono text-xs text-ink-muted tabular-nums">
            {formatNumber(new30)} neu · {formatNumber(canceled30)} gekündigt · Saldo {new30 - canceled30 > 0 ? "+" : ""}
            {formatNumber(new30 - canceled30)}
          </p>
        </Card>
      </div>
    </section>
  );
}

function NextSteps({ rejected, premoderationCount }: { rejected: boolean; premoderationCount: number }) {
  const steps: { title: string; text: ReactNode; state: "done" | "current" | "todo" | "blocked" }[] = [
    { title: "Profil eingerichtet", text: "Handle, Name und Altersbestätigung sind erledigt.", state: "done" },
    {
      title: rejected ? "Bewerbung abgelehnt" : "Bewerbung eingereicht",
      text: rejected ? (
        <>
          Lies die Begründung oben, passe Bio oder Preis an und{" "}
          <Link href="/studio/become-creator" className="font-medium text-ink underline underline-offset-4">
            bewirb dich erneut
          </Link>
          .
        </>
      ) : (
        "Bio und Monatspreis sind bei uns eingegangen."
      ),
      state: rejected ? "blocked" : "done",
    },
    {
      title: "Prüfung durch unser Team",
      text: "Wir prüfen jedes Profil persönlich. Nach der Freigabe ist deine Seite öffentlich.",
      state: rejected ? "todo" : "current",
    },
    {
      title: "Erste Posts hochladen",
      text: `Bis zu 10 Bilder pro Post. Deine ersten ${premoderationCount} Posts schauen wir uns vor der Veröffentlichung an.`,
      state: "todo",
    },
  ];

  return (
    <section aria-labelledby="next-steps-title" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <div>
        <h2 id="next-steps-title" className="font-display text-2xl leading-none font-bold tracking-[-0.03em] text-ink">
          So geht es weiter
        </h2>
        <ol className="mt-5 grid gap-0">
          {steps.map((step, i) => (
            <li key={step.title} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 pb-6 last:pb-0">
              {i < steps.length - 1 ? <span aria-hidden className="absolute top-8 bottom-1 left-[13.5px] w-px bg-line-strong" /> : null}
              <StepMarker state={step.state} index={i + 1} />
              <div className="pt-0.5">
                <p className={cn("text-[15px] font-semibold", step.state === "todo" ? "text-ink-muted" : "text-ink")}>
                  {step.title}
                  <span className="sr-only">
                    {step.state === "done" ? " (erledigt)" : step.state === "current" ? " (läuft)" : step.state === "blocked" ? " (abgelehnt)" : " (offen)"}
                  </span>
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <Card title="In der Zwischenzeit">
        <p className="text-sm leading-relaxed text-ink-muted">
          Feile an deiner Bio und an deinem Preis – beides siehst du später auf deinem Profil. Und schau dir an, was Premium bringt, sobald die ersten Fans da sind.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <ButtonLink href="/studio/settings" variant="secondary" size="sm">
            Bio &amp; Preis bearbeiten
          </ButtonLink>
          <ButtonLink href="/studio/premium" variant="ghost" size="sm">
            Premium ansehen
          </ButtonLink>
        </div>
      </Card>
    </section>
  );
}

function StepMarker({ state, index }: { state: "done" | "current" | "todo" | "blocked"; index: number }) {
  const base = "relative z-10 grid size-7 place-items-center rounded-full border font-mono text-[11px] font-medium";
  if (state === "done") {
    return (
      <span aria-hidden className={cn(base, "border-success/40 bg-success/10 text-success")}>
        <Check className="size-3.5" />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span aria-hidden className={cn(base, "border-warning/50 bg-surface text-warning")}>
        <CircleDashed className="size-3.5 motion-safe:animate-[spin_6s_linear_infinite]" />
      </span>
    );
  }
  if (state === "blocked") {
    return (
      <span aria-hidden className={cn(base, "border-danger/50 bg-danger/10 text-danger")}>
        {index}
      </span>
    );
  }
  return (
    <span aria-hidden className={cn(base, "border-line-strong bg-surface text-ink-faint")}>
      {index}
    </span>
  );
}

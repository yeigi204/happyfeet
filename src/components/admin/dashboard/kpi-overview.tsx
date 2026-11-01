import { Sparkline } from "@/components/charts/sparkline";
import { Stat } from "@/components/ui/stat";
import { formatChf, formatDate, formatNumber, formatPercent } from "@/lib/format";

import { directionOf, formatSignedNumber, formatSignedPercentPoints } from "../lib/format-delta";

export type KpiOverviewProps = {
  kpis: {
    mrrRappen: number;
    mrrDeltaPct: number | null;
    platformMrrRappen: number;
    platformRevenue30dRappen: number;
    platformRevenueDeltaPct: number | null;
    grossVolume30dRappen: number;
    activeSubscriptions: number;
    activeSubscriptionsDelta30d: number;
    creatorsApproved: number;
    creatorsPending: number;
    creatorsPremium: number;
    fans: number;
    premiumSharePct: number;
  };
  /** Aktive Abos pro Tag (90 Tage) – Verlauf unter der MRR. */
  activeSeries: { date: string; active: number }[];
  today: { newSubs: number; canceledSubs: number } | null;
  now: Date;
};

const DAY_MS = 86_400_000;

function pctDelta(pct: number | null) {
  const value = formatSignedPercentPoints(pct);
  return value ? { value, direction: directionOf(pct ?? 0) } : undefined;
}

function dayLabel(isoDate: string | undefined): string {
  return isoDate ? formatDate(new Date(`${isoDate}T12:00:00Z`)) : "";
}

/** Hero-Kennzahl (MRR + Verlauf) und das KPI-Raster daneben – Vorlage: Design-System, Abschnitt Admin. */
export function KpiOverview({ kpis: k, activeSeries, today, now }: KpiOverviewProps) {
  const takeRate = k.grossVolume30dRappen > 0 ? k.platformRevenue30dRappen / k.grossVolume30dRappen : null;
  const compareDate = formatDate(new Date(now.getTime() - 30 * DAY_MS));

  return (
    <section aria-label="Kennzahlen" className="grid overflow-hidden rounded-card border border-line bg-surface lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="relative border-b border-line p-5 sm:p-7 lg:border-r lg:border-b-0">
        <Stat
          size="lg"
          label="MRR · Fan-Abos"
          value={formatChf(k.mrrRappen)}
          delta={pctDelta(k.mrrDeltaPct)}
          hint={k.mrrDeltaPct === null ? "noch keine Vergleichsbasis" : `vs. ${compareDate}`}
        >
          <Sparkline values={activeSeries.map((d) => d.active)} label="Aktive Abos, letzte 90 Tage" className="mt-6 h-16" />
          <div className="mt-2 flex justify-between font-mono text-[10.5px] text-ink-faint">
            <span>{dayLabel(activeSeries[0]?.date)}</span>
            <span>aktive Abos · heute</span>
          </div>
        </Stat>
        <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-4">
          {[
            ["Plattform-MRR", formatChf(k.platformMrrRappen, { compact: true }), "Erwartete Provision auf die MRR plus laufende Premium-Pläne"],
            ["Take-Rate", takeRate === null ? "–" : formatPercent(takeRate, 1), "Plattform-Umsatz geteilt durch Bruttovolumen, letzte 30 Tage"],
            ["Heute", today ? `${formatSignedNumber(today.newSubs)} / ${today.canceledSubs > 0 ? `-${formatNumber(today.canceledSubs)}` : "0"}` : "–", "Neue Abos / Kündigungen heute"],
          ].map(([label, value, title]) => (
            <div key={label} className="min-w-0" title={title}>
              <dt className="eyebrow truncate">{label}</dt>
              <dd className="mt-2 font-mono text-[13px] whitespace-nowrap text-ink tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 [&>*]:border-line [&>*]:p-5 sm:[&>*]:p-6">
        <Stat
          className="border-r border-b"
          label="Plattform-Umsatz 30 T"
          value={formatChf(k.platformRevenue30dRappen, { compact: true })}
          delta={pctDelta(k.platformRevenueDeltaPct)}
          hint={k.platformRevenueDeltaPct === null ? undefined : "vs. Vorperiode"}
        />
        <Stat className="border-b sm:border-r" label="Bruttovolumen 30 T" value={formatChf(k.grossVolume30dRappen, { compact: true })} hint="alle Zahlungen" />
        <Stat
          className="border-r border-b sm:border-r-0"
          label="Aktive Abos"
          value={formatNumber(k.activeSubscriptions)}
          delta={{ value: formatSignedNumber(k.activeSubscriptionsDelta30d), direction: directionOf(k.activeSubscriptionsDelta30d) }}
          hint="30 T"
        />
        <Stat
          className="border-b sm:border-r sm:border-b-0"
          label="Creator freigegeben"
          value={formatNumber(k.creatorsApproved)}
          hint={k.creatorsPending === 1 ? "1 in Prüfung" : `${formatNumber(k.creatorsPending)} in Prüfung`}
        />
        <Stat className="border-r" label="Fans" value={formatNumber(k.fans)} hint="aktiv, ohne Creator" />
        <Stat
          label="Premium-Anteil"
          value={formatPercent(k.premiumSharePct / 100, 1)}
          hint={k.creatorsPremium === 1 ? "1 Creator" : `${formatNumber(k.creatorsPremium)} Creator`}
        />
      </div>
    </section>
  );
}

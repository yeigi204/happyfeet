import Link from "next/link";

import { Meter } from "@/components/charts/meter";
import { Card } from "@/components/ui/card";
import { formatChf, formatPercentBps } from "@/lib/format";

export type FeeMixCardProps = {
  feeMix: { standardFeesRappen: number; premiumFeesRappen: number; premiumPlansRappen: number };
  settings: { standardFeeBps: number; premiumFeeBps: number; premiumPriceRappen: number };
};

/** Woher der Plattform-Umsatz kommt + die aktuell gültigen Sätze. */
export function FeeMixCard({ feeMix, settings }: FeeMixCardProps) {
  return (
    <Card>
      <div className="grid gap-8">
        <Meter
          title="Provisions-Mix · 30 T"
          format="chf"
          parts={[
            { label: "Provision Standard-Creator", value: feeMix.standardFeesRappen, color: "series-1" },
            { label: "Provision Premium-Creator", value: feeMix.premiumFeesRappen, color: "series-2" },
            { label: "Premium-Pläne", value: feeMix.premiumPlansRappen, color: "series-3" },
          ]}
        />
        <div>
          <p className="flex items-baseline justify-between text-[13px] font-semibold text-ink">
            Aktuelle Sätze
            <Link href="/admin/settings" className="text-xs font-normal text-ink-muted hover:text-ink">
              Einstellungen →
            </Link>
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-control border border-line bg-line">
            {[
              ["Standard", formatPercentBps(settings.standardFeeBps)],
              ["Premium", formatPercentBps(settings.premiumFeeBps)],
              ["Plan / Mt.", formatChf(settings.premiumPriceRappen)],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface px-3 py-2.5">
                <dt className="eyebrow">{label}</dt>
                <dd className="mt-2 font-mono text-[13px] whitespace-nowrap text-ink tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Card>
  );
}

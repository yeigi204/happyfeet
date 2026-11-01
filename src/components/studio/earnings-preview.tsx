import { splitPayment } from "@/lib/domain/fees";
import type { CreatorPlan } from "@/lib/domain/types";
import { formatChf, formatPercentBps } from "@/lib/format";

export type EarningsPreviewProps = {
  /** `null`: Eingabe (noch) nicht lesbar. */
  priceRappen: number | null;
  standardFeeBps: number;
  premiumFeeBps: number;
  /** Hebt die Zeile des aktuellen Plans hervor. */
  plan: CreatorPlan;
  /** Warum der Preis so nicht gespeichert würde (Rahmen, 10-Rappen-Schritte) – live, vor dem Absenden. */
  warning?: string | null;
};

/** Live-Rechnung „Fan zahlt → Provision → du erhältst“ pro Abo und Monat. Rein, server- und client-fähig. */
export function EarningsPreview({ priceRappen, standardFeeBps, premiumFeeBps, plan, warning }: EarningsPreviewProps) {
  const valid = priceRappen !== null && Number.isSafeInteger(priceRappen) && priceRappen >= 0;
  const feeBps = plan === "premium" ? premiumFeeBps : standardFeeBps;
  const split = valid ? splitPayment(priceRappen, feeBps) : null;
  const other = valid ? splitPayment(priceRappen, plan === "premium" ? standardFeeBps : premiumFeeBps) : null;
  const dash = "–";

  return (
    <div className="rounded-control border border-line bg-surface-2/60 p-3.5">
      <p className="eyebrow">Pro Abo und Monat</p>
      <dl className="mt-3 grid gap-1.5 font-num text-[13px] tabular-nums">
        <div className="flex justify-between gap-4">
          <dt className="font-sans text-ink-muted">Fan zahlt</dt>
          <dd className="text-ink">{valid ? formatChf(priceRappen) : dash}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="font-sans text-ink-muted">Provision {formatPercentBps(feeBps)}</dt>
          <dd className="text-ink-muted">{split ? formatChf(-split.platformFeeRappen) : dash}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-line pt-1.5">
          <dt className="font-sans font-medium text-ink">Du erhältst</dt>
          <dd className="font-medium text-ink">{split ? formatChf(split.creatorNetRappen) : dash}</dd>
        </div>
      </dl>
      <p className="mt-2.5 text-xs leading-relaxed text-ink-faint">
        {plan === "premium"
          ? `Ohne Premium (${formatPercentBps(standardFeeBps)}): ${other ? formatChf(other.creatorNetRappen) : dash}`
          : `Mit Premium (${formatPercentBps(premiumFeeBps)}): ${other ? formatChf(other.creatorNetRappen) : dash}`}
        {warning ? (
          <span role="status" className="mt-1 block text-warning">
            {warning}
          </span>
        ) : null}
      </p>
    </div>
  );
}

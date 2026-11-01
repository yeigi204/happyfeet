import { ArrowRight, Check } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { splitPayment } from "@/lib/domain/fees";
import { formatChf, formatPercentBps } from "@/lib/format";

export type PremiumTeaserProps = {
  priceRappen: number;
  standardFeeBps: number;
  premiumFeeBps: number;
  premiumPriceRappen: number;
};

/**
 * Für Standard-Creator anstelle der erweiterten Statistik: zeigt konkret, was Premium hier freischaltet –
 * mit dem eigenen Preis gerechnet. Die Diagramm-Silhouette ist reine Deko (keine erfundenen Zahlen).
 */
export function PremiumTeaser({ priceRappen, standardFeeBps, premiumFeeBps, premiumPriceRappen }: PremiumTeaserProps) {
  const standardNet = splitPayment(priceRappen, standardFeeBps).creatorNetRappen;
  const premiumNet = splitPayment(priceRappen, premiumFeeBps).creatorNetRappen;

  const perks = [
    "Netto-Verlauf über 90 Tage und neue Abos gegen Kündigungen – Tag für Tag",
    "Wiederkehrender Monatsumsatz (MRR) und Kündigungsrate der letzten 30 Tage",
    `${formatPercentBps(premiumFeeBps)} statt ${formatPercentBps(standardFeeBps)} Provision: pro Abo ${formatChf(premiumNet)} statt ${formatChf(standardNet)} für dich`,
    "Wöchentliche statt monatliche Auszahlung",
    "Premium-Badge und Vorrang beim Entdecken",
  ];

  return (
    <section
      aria-labelledby="premium-teaser-title"
      className="grid overflow-hidden rounded-card border border-premium/35 bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
    >
      <div className="p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <PremiumBadge />
          <span className="font-num text-xs text-ink-faint">{formatChf(premiumPriceRappen)} pro Monat</span>
        </div>
        <h2 id="premium-teaser-title" className="mt-4 font-display text-[28px] leading-[0.95] font-bold tracking-[-0.04em] text-ink sm:text-[34px]">
          Hier stünde dein 90-Tage-Verlauf.
        </h2>
        <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-ink-muted">
          Die erweiterte Statistik gehört zu Premium. Damit siehst du, an welchen Tagen Fans dazukommen oder abspringen – und behältst mehr von jedem Abo.
        </p>
        <ul className="mt-5 grid gap-2.5">
          {perks.map((perk) => (
            <li key={perk} className="flex gap-2.5 text-sm leading-snug text-ink">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-premium" />
              <span>{perk}</span>
            </li>
          ))}
        </ul>
        <ButtonLink href="/studio/premium" variant="primary" className="mt-7">
          Premium ansehen
          <ArrowRight aria-hidden />
        </ButtonLink>
      </div>
      <TeaserChart />
    </section>
  );
}

/** Ruhige Silhouette eines Flächendiagramms und gespiegelter Balken – nur Form, keine Werte. */
function TeaserChart() {
  const area =
    "M0 118 C 30 112, 52 120, 80 104 S 132 92, 160 96 S 214 70, 242 78 S 296 58, 324 50 S 372 44, 400 30 L 400 150 L 0 150 Z";
  const line = "M0 118 C 30 112, 52 120, 80 104 S 132 92, 160 96 S 214 70, 242 78 S 296 58, 324 50 S 372 44, 400 30";
  const ups = [8, 14, 6, 18, 11, 22, 9, 16, 20, 12, 25, 15, 19, 28, 17, 23];
  const downs = [4, 2, 7, 3, 5, 2, 6, 3, 4, 8, 2, 5, 3, 4, 6, 3];
  return (
    <div aria-hidden className="relative hidden min-h-64 border-t border-line bg-surface-2/60 sm:block lg:border-t-0 lg:border-l">
      <div className="absolute inset-0 grid grid-rows-[1.4fr_1fr] gap-6 p-7">
        <svg viewBox="0 0 400 150" preserveAspectRatio="none" className="size-full overflow-visible">
          {[30, 70, 110, 150].map((y) => (
            <line key={y} x1="0" x2="400" y1={y} y2={y} stroke="var(--color-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={area} fill="var(--color-ink-faint)" fillOpacity="0.08" />
          <path d={line} fill="none" stroke="var(--color-ink-faint)" strokeOpacity="0.55" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        <svg viewBox="0 0 400 80" preserveAspectRatio="none" className="size-full">
          <line x1="0" x2="400" y1="48" y2="48" stroke="var(--color-line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {ups.map((h, i) => (
            <rect key={`u${i}`} x={i * 25 + 6} y={47 - h * 1.5} width="13" height={h * 1.5} rx="2" fill="var(--color-ink-faint)" fillOpacity="0.28" />
          ))}
          {downs.map((h, i) => (
            <rect key={`d${i}`} x={i * 25 + 6} y="49" width="13" height={h * 2.6} rx="2" fill="var(--color-ink-faint)" fillOpacity="0.16" />
          ))}
        </svg>
      </div>
      <span className="absolute top-5 right-5 inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-2.5 py-1 font-num text-[10.5px] tracking-[0.08em] text-ink-muted uppercase">
        Vorschau
      </span>
    </div>
  );
}

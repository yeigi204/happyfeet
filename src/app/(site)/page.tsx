import { ArrowRight, BadgeCheck, EyeOff, Flag, ShieldCheck, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Meter } from "@/components/charts/meter";
import { Container } from "@/components/site/container";
import { CreatorCard } from "@/components/site/creator-card";
import { premoderationCopy } from "@/components/site/text";
import { ToeGallery } from "@/components/site/toe-gallery";
import { ButtonLink } from "@/components/ui/button";
import { splitPayment } from "@/lib/domain/fees";
import { formatChf, formatPercentBps } from "@/lib/format";
import { getViewer } from "@/server/auth/viewer";
import { listCreatorsForExplore } from "@/server/services/creators";
import { getPlatformSettings } from "@/server/services/settings";

export const metadata: Metadata = {
  title: { absolute: "happyfeet – Fussbilder im Abo, direkt von Creatorn aus der Schweiz" },
  description:
    "Abonniere Creator aus der Schweiz für einen fixen Monatspreis in Franken. Ohne Abo bleibt alles verpixelt – mit Abo siehst du jedes Bild in voller Schärfe.",
};

const FULL_BPS = 10_000;

/** Beispielpreis fürs Rechenbeispiel: der Median der sichtbaren Creator (sonst CHF 12.90). */
function examplePrice(prices: number[]): number {
  if (prices.length === 0) return 1290;
  const sorted = [...prices].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export default async function LandingPage() {
  const viewer = await getViewer();
  const [creators, settings] = await Promise.all([listCreatorsForExplore(viewer, { limit: 6 }), getPlatformSettings()]);

  const gross = examplePrice(creators.map((c) => c.monthlyPriceRappen));
  const standard = splitPayment(gross, settings.standardFeeBps);
  const premium = splitPayment(gross, settings.premiumFeeBps);
  const feeGap = settings.standardFeeBps - settings.premiumFeeBps;
  const breakEven = feeGap > 0 ? Math.ceil((settings.premiumPriceRappen * FULL_BPS) / feeGap) : null;

  const creatorHref = !viewer ? "/sign-up" : viewer.creator ? "/studio" : "/studio/become-creator";
  const creatorCta = !viewer ? "Als Creator starten" : viewer.creator ? "Zum Studio" : "Creator werden";

  return (
    <>
      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <Container className="grid gap-12 pt-12 pb-20 sm:pt-20 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:gap-16 lg:pt-24 lg:pb-28">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <span aria-hidden className="size-1.5 rounded-full bg-accent" />
            Fussbilder im Abo · aus der Schweiz
          </p>
          <h1 className="mt-6 font-display text-[52px] leading-[0.88] font-extrabold tracking-[-0.06em] text-ink sm:text-[88px] xl:text-[104px]">
            Abonniere,
            <br />
            was sonst
            <br />
            <span className="text-accent">verpixelt</span> bleibt.
          </h1>
          <p className="mt-8 max-w-[34rem] text-[17px] leading-relaxed text-ink-muted">
            Creator aus der Schweiz zeigen hier ihre Füsse – frisch lackiert, barfuss am See, nach dem Training. Du abonnierst
            direkt bei ihnen, für einen fixen Monatspreis in Franken. Kündbar, wann du willst.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink href="/explore" variant="primary" size="lg">
              Creator entdecken <ArrowRight aria-hidden />
            </ButtonLink>
            {viewer ? (
              <ButtonLink href="/feed" variant="secondary" size="lg">
                Zu deinem Feed
              </ButtonLink>
            ) : (
              <ButtonLink href="/sign-up" variant="secondary" size="lg">
                Konto erstellen
              </ButtonLink>
            )}
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 font-num text-[11px] tracking-[0.12em] text-ink-faint uppercase">
            <li>Ab 18</li>
            <li>Geprüfte Creator</li>
            <li>Bezahlt in CHF</li>
          </ul>
        </div>

        <figure className="min-w-0 overflow-hidden rounded-card border border-line bg-surface">
          <div className="relative px-6 pt-10 pb-0 sm:px-10 sm:pt-14">
            <ToeGallery creators={creators.slice(0, 5)} className="mx-auto max-w-[520px]" />
            <div aria-hidden className="h-10 sm:h-14" />
          </div>
          {creators.length > 0 ? (
            <figcaption className="relative border-t border-line bg-surface px-5 py-4 sm:px-6">
              <p className="eyebrow">Fünf Zehen, fünf Creator</p>
              <ol className="mt-3 grid gap-1.5 text-sm">
                {creators.slice(0, 5).map((creator, i) => (
                  <li key={creator.userId} className="flex min-w-0 items-baseline gap-2.5">
                    <span className="font-num text-[11px] text-ink-faint tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <Link
                      href={`/c/${creator.handle}`}
                      className="truncate rounded-control text-ink underline-offset-4 hover:text-accent hover:underline"
                    >
                      {creator.displayName}
                    </Link>
                    <span className="hidden truncate font-num text-xs text-ink-faint sm:inline">@{creator.handle}</span>
                    <span className="ml-auto shrink-0 font-num text-xs text-ink-muted tabular-nums">
                      {formatChf(creator.monthlyPriceRappen)}
                    </span>
                  </li>
                ))}
              </ol>
            </figcaption>
          ) : null}
        </figure>
      </Container>

      {/* ─── Zwei Seiten ─────────────────────────────────────────────────── */}
      <section aria-labelledby="zwei-seiten" className="border-y border-line bg-surface">
        <Container className="py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="eyebrow">So funktioniert happyfeet</p>
            <h2 id="zwei-seiten" className="mt-4 font-display text-[36px] leading-[0.95] font-bold tracking-[-0.045em] sm:text-[52px]">
              Zwei Seiten, ein fairer Deal.
            </h2>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-2">
            <Side
              kicker="Für Fans"
              title="Abonniere, wen du magst – zum fixen Monatspreis."
              steps={[
                {
                  title: "Stöbern",
                  text: "Profile, Bios und Preise sind offen. Gesperrte Posts siehst du als verpixelte Vorschau – so weisst du, was dich erwartet.",
                },
                {
                  title: "Abonnieren",
                  text: "Jeder Creator legt den eigenen Monatspreis fest. Du zahlst in Franken, ohne Abo-Fallen.",
                },
                {
                  title: "Geniessen",
                  text: "Alle Bilder in voller Auflösung, neue Posts direkt in deinem Feed. Kündigen geht mit zwei Klicks – der Zugang bleibt bis zum Monatsende.",
                },
              ]}
              action={
                <ButtonLink href="/explore" variant="primary">
                  Creator entdecken
                </ButtonLink>
              }
            />
            <Side
              kicker="Für Creator"
              title="Verdiene mit deinen Fussbildern – ohne Umwege."
              steps={[
                {
                  title: "Bewerben",
                  text: `Profil anlegen und einen Monatspreis zwischen ${formatChf(settings.minPriceRappen)} und ${formatChf(settings.maxPriceRappen)} wählen. Wir prüfen dein Profil, bevor es öffentlich wird.`,
                },
                {
                  title: "Posten",
                  text: `Ein bis zehn Bilder pro Post, öffentlich oder nur für Abonnenten. ${premoderationCopy(settings.premoderationCount, {
                    off: "Nach der Freigabe gehen deine Posts sofort online.",
                    one: "Den ersten Post schauen wir uns vorab an.",
                    many: (n) => `Die ersten ${n} Posts schauen wir uns vorab an.`,
                  })}`,
                },
                {
                  title: "Verdienen",
                  text: `Wir behalten ${formatPercentBps(settings.standardFeeBps)} Provision, mit Premium nur ${formatPercentBps(settings.premiumFeeBps)}. Dazu Badge, Such-Boost, erweiterte Statistik und wöchentliche statt monatliche Auszahlung.`,
                },
              ]}
              action={
                <ButtonLink href={creatorHref} variant="secondary">
                  {creatorCta}
                </ButtonLink>
              }
            />
          </div>
        </Container>
      </section>

      {/* ─── Rechenbeispiel ─────────────────────────────────────────────── */}
      <Container className="grid gap-10 py-16 sm:py-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div>
          <p className="eyebrow">Was bei dir ankommt</p>
          <h2 className="mt-4 font-display text-[36px] leading-[0.95] font-bold tracking-[-0.045em] sm:text-[52px]">
            {formatPercentBps(FULL_BPS - settings.standardFeeBps)} für dich.
            <br />
            <span className="text-ink-faint">Mit Premium {formatPercentBps(FULL_BPS - settings.premiumFeeBps)}.</span>
          </h2>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-ink-muted">
            Premium kostet <span className="font-num text-ink">{formatChf(settings.premiumPriceRappen)}</span> im Monat
            {breakEven !== null ? (
              <>
                {" "}
                und rechnet sich ab rund <span className="font-num text-ink">{formatChf(breakEven, { compact: true })}</span> Abo-Umsatz
                pro Monat
              </>
            ) : null}
            . Die Provision wird bei jeder Zahlung festgehalten – keine Überraschungen im Nachhinein.
          </p>
        </div>

        <div className="rounded-card border border-line bg-surface p-5 sm:p-8">
          <p className="text-sm text-ink-muted">
            Beispiel: ein Abo für <span className="font-num text-ink">{formatChf(gross)}</span> im Monat
          </p>
          <div className="mt-6 grid gap-8">
            <Meter
              title={`Standard · ${formatPercentBps(settings.standardFeeBps)} Provision`}
              format="chf"
              parts={[
                { label: "Du erhältst", value: standard.creatorNetRappen, color: "series-2" },
                { label: "Provision happyfeet", value: standard.platformFeeRappen, color: "series-1" },
              ]}
            />
            <Meter
              title={`Premium · ${formatPercentBps(settings.premiumFeeBps)} Provision`}
              format="chf"
              parts={[
                { label: "Du erhältst", value: premium.creatorNetRappen, color: "series-2" },
                { label: "Provision happyfeet", value: premium.platformFeeRappen, color: "series-1" },
              ]}
            />
          </div>
          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-control border border-line bg-line">
            <div className="bg-surface p-4">
              <dt className="eyebrow">Standard · pro Abo</dt>
              <dd className="mt-2 font-num text-xl font-medium tracking-[-0.03em] text-ink tabular-nums">
                {formatChf(standard.creatorNetRappen)}
              </dd>
            </div>
            <div className="bg-surface p-4">
              <dt className="eyebrow">Premium · pro Abo</dt>
              <dd className="mt-2 font-num text-xl font-medium tracking-[-0.03em] text-ink tabular-nums">
                {formatChf(premium.creatorNetRappen)}
              </dd>
            </div>
          </dl>
        </div>
      </Container>

      {/* ─── Creator-Teaser ─────────────────────────────────────────────── */}
      {creators.length > 0 ? (
        <section aria-labelledby="creator-teaser" className="border-t border-line">
          <Container className="py-16 sm:py-24">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Gerade auf happyfeet</p>
                <h2 id="creator-teaser" className="mt-4 font-display text-[36px] leading-[0.95] font-bold tracking-[-0.045em] sm:text-[52px]">
                  Schau dich um.
                </h2>
              </div>
              <Link
                href="/explore"
                className="group inline-flex items-center gap-1.5 rounded-control text-sm font-medium text-ink underline-offset-4 hover:underline"
              >
                Alle Creator ansehen
                <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {creators.map((creator) => (
                <li key={creator.userId} className="flex min-w-0">
                  <CreatorCard creator={creator} className="w-full" />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}

      {/* ─── Sicherheit ─────────────────────────────────────────────────── */}
      <section aria-labelledby="sicherheit" className="border-t border-line">
        <Container className="py-16 sm:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
            <div>
              <p className="eyebrow">Was wir ernst nehmen</p>
              <h2 id="sicherheit" className="mt-4 font-display text-[36px] leading-[0.95] font-bold tracking-[-0.045em] sm:text-[44px]">
                Diskret, geprüft, nur für Erwachsene.
              </h2>
            </div>
            <ul className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
              <Assurance icon={ShieldCheck} title="Nur ab 18">
                Bei der Registrierung bestätigst du dein Alter mit dem Geburtsdatum. Unter 18 gibt es keinen Zugang.
              </Assurance>
              <Assurance icon={BadgeCheck} title="Geprüfte Creator">
                Jedes Creator-Profil geben wir von Hand frei, bevor es öffentlich wird. Neue Posts prüfen wir am Anfang vorab.
              </Assurance>
              <Assurance icon={EyeOff} title="Originale bleiben privat">
                Ohne Abo verlässt nur eine verpixelte Vorschau unseren Server. Bild-Links laufen nach wenigen Minuten ab.
              </Assurance>
              <Assurance icon={Flag} title="Melden mit einem Klick">
                Stimmt mit einem Post etwas nicht, meldest du ihn direkt. Wir schauen uns jede Meldung an.
              </Assurance>
            </ul>
          </div>
        </Container>
      </section>

      {/* ─── Abschluss ──────────────────────────────────────────────────── */}
      <Container>
        <div className="flex flex-col gap-8 rounded-card bg-ink px-6 py-12 text-canvas sm:px-12 sm:py-16 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-num text-[10.5px] tracking-[0.09em] text-canvas/60 uppercase">Bereit?</p>
            <p className="mt-4 max-w-2xl font-display text-[34px] leading-[0.95] font-bold tracking-[-0.045em] sm:text-[52px]">
              Such dir deine Lieblings-Creator aus.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/explore" variant="primary" size="lg">
              Creator entdecken <ArrowRight aria-hidden />
            </ButtonLink>
            {!viewer ? (
              <Link
                href="/sign-up"
                className="inline-flex h-12 items-center rounded-control border border-canvas/30 px-6 text-[15px] font-medium text-canvas transition-colors hover:border-canvas/70"
              >
                Konto erstellen
              </Link>
            ) : null}
          </div>
        </div>
      </Container>
    </>
  );
}

function Side({
  kicker,
  title,
  steps,
  action,
}: {
  kicker: string;
  title: string;
  steps: { title: string; text: string }[];
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col bg-canvas p-6 sm:p-10">
      <p className="flex items-center gap-2 font-num text-[11px] tracking-[0.12em] text-accent-strong uppercase">
        <span aria-hidden className="size-1.5 rounded-full bg-accent" />
        {kicker}
      </p>
      <h3 className="mt-4 max-w-md font-display text-[26px] leading-[1.02] font-bold tracking-[-0.035em] sm:text-[30px]">{title}</h3>
      <ol className="mt-8 grid gap-6">
        {steps.map((step, i) => (
          <li key={step.title} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3">
            <span className="font-num text-[13px] text-ink-faint tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <p className="font-medium text-ink">{step.title}</p>
              <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-auto pt-10">{action}</div>
    </div>
  );
}

function Assurance({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <li className="bg-surface p-6">
      <Icon aria-hidden className="size-5 text-accent" strokeWidth={1.75} />
      <p className="mt-4 font-display text-lg leading-tight font-semibold tracking-[-0.02em] text-ink">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{children}</p>
    </li>
  );
}

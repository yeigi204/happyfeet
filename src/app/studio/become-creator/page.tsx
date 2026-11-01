import { ArrowDown, BadgeCheck, CalendarClock, Images, Percent, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Container } from "@/components/site/container";
import { premoderationCopy } from "@/components/site/text";
import { CreatorProfileForm } from "@/components/studio/creator-profile-form";
import { rappenToChfInput } from "@/components/studio/price";
import { splitPayment } from "@/lib/domain/fees";
import { formatChf, formatPercentBps } from "@/lib/format";
import { requireOnboardedViewer } from "@/server/auth/viewer";
import { CREATOR_BIO_MAX_LENGTH, getMyCreatorProfile } from "@/server/services/creators";
import { getPlatformSettings } from "@/server/services/settings";

import { applyAsCreatorAction } from "./actions";

export const metadata: Metadata = { title: "Creator werden" };

/** Beispielpreis für die Erklärung, wenn die eigene Eingabe noch fehlt (innerhalb des Rahmens gehalten). */
const EXAMPLE_PRICE_RAPPEN = 990;

/**
 * Bewerbung als Creator. Bewusst `requireOnboardedViewer()` statt `requireCreator()` – sonst landen
 * Nutzer ohne Creator-Profil in einer Weiterleitungsschleife. Laufende oder freigegebene Bewerbungen → Studio.
 */
export default async function BecomeCreatorPage() {
  const viewer = await requireOnboardedViewer();
  const status = viewer.creator?.verificationStatus;
  if (status === "pending" || status === "approved") redirect("/studio");

  const [settings, profile] = await Promise.all([getPlatformSettings(), status === "rejected" ? getMyCreatorProfile(viewer) : null]);
  const reapply = status === "rejected";

  const examplePrice = Math.min(Math.max(EXAMPLE_PRICE_RAPPEN, settings.minPriceRappen), settings.maxPriceRappen);
  const standardShare = formatPercentBps(10_000 - settings.standardFeeBps);
  const premiumShare = formatPercentBps(10_000 - settings.premiumFeeBps);
  const exampleNet = splitPayment(examplePrice, settings.standardFeeBps).creatorNetRappen;

  const steps: { icon: LucideIcon; title: string; text: string }[] = [
    {
      icon: BadgeCheck,
      title: "Wir prüfen dein Profil",
      text: "Jede Bewerbung schaut sich unser Team persönlich an. Erst nach der Freigabe ist deine Seite öffentlich und du kannst posten.",
    },
    {
      icon: Images,
      title: "Du postest, Fans abonnieren",
      text: `Bis zu 10 Bilder pro Post, öffentlich oder nur für Abonnenten. ${premoderationCopy(settings.premoderationCount, {
        off: "Nach der Freigabe gehen deine Posts sofort online.",
        one: "Deinen ersten Post prüfen wir vorab, danach gehen deine Posts sofort online.",
        many: (n) => `Deine ersten ${n} Posts prüfen wir vorab, danach gehen sie sofort online.`,
      })}`,
    },
    {
      icon: Percent,
      title: `Du behältst ${standardShare} – mit Premium ${premiumShare}`,
      text: `Die Plattform behält ${formatPercentBps(settings.standardFeeBps)} Provision, mit Premium (${formatChf(settings.premiumPriceRappen)} pro Monat) nur ${formatPercentBps(settings.premiumFeeBps)}. Bei ${formatChf(examplePrice)} bleiben dir ${formatChf(exampleNet)} pro Abo und Monat.`,
    },
    {
      icon: CalendarClock,
      title: "Auszahlung in Franken",
      text: "Dein Guthaben zahlen wir monatlich aus, mit Premium jede Woche. Den Stand siehst du jederzeit im Studio.",
    },
  ];

  return (
    <Container className="py-10 sm:py-16">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-16">
        <div>
          <p className="eyebrow">{reapply ? "Neue Bewerbung" : "Creator werden"}</p>
          <h1 className="mt-5 font-display text-[44px] leading-[0.9] font-extrabold tracking-[-0.055em] text-ink sm:text-[68px]">
            {reapply ? (
              <>
                Zweiter Anlauf<span className="text-accent">.</span>
              </>
            ) : (
              <>
                Deine Bilder.
                <br />
                Dein Preis<span className="text-accent">.</span>
              </>
            )}
          </h1>
          <p className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-ink-muted">
            {reapply
              ? "Passe Bio und Preis an und schick deine Bewerbung nochmals ab. Wir schauen sie uns wieder persönlich an."
              : "Fans abonnieren dich für einen fixen Monatspreis, den du selbst festlegst. Keine Einzelkäufe, keine Rabattschlachten – nur ein Abo pro Fan."}
          </p>
          <a
            href="#bewerbung"
            className="mt-6 inline-flex items-center gap-1.5 rounded-control text-sm font-medium text-ink underline decoration-accent decoration-2 underline-offset-4 lg:hidden"
          >
            Direkt zur Bewerbung
            <ArrowDown aria-hidden className="size-4" />
          </a>

          <ol className="mt-10 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="bg-surface p-5">
                  <div className="flex items-center justify-between">
                    <span aria-hidden className="grid size-9 place-items-center rounded-full border border-line-strong text-ink">
                      <Icon className="size-4" />
                    </span>
                    <span aria-hidden className="font-num text-[11px] text-ink-faint tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h2 className="mt-4 text-[15px] leading-snug font-semibold text-ink">{step.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{step.text}</p>
                </li>
              );
            })}
          </ol>
        </div>

        <section id="bewerbung" aria-labelledby="apply-title" className="scroll-mt-20 lg:pt-2">
          <div className="rounded-card border border-line bg-surface p-5 sm:p-7 lg:sticky lg:top-24">
            <h2 id="apply-title" className="font-display text-2xl leading-tight font-bold tracking-[-0.03em] text-ink">
              {reapply ? "Erneut bewerben" : "Deine Bewerbung"}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              Du bewirbst dich als <span className="font-num text-ink">@{viewer.handle}</span>. Bio und Preis kannst du später jederzeit ändern.
            </p>

            {reapply && profile?.verificationNote ? (
              <div className="mt-5 rounded-control bg-danger-soft p-3.5">
                <p className="text-[13px] font-medium text-ink">Begründung der letzten Ablehnung</p>
                <blockquote className="mt-1.5 border-l-2 border-danger/60 pl-3 text-sm leading-relaxed text-ink">{profile.verificationNote}</blockquote>
              </div>
            ) : null}

            <div className="mt-6">
              <CreatorProfileForm
                action={applyAsCreatorAction}
                defaults={{
                  bio: profile?.bio ?? "",
                  price: profile ? rappenToChfInput(profile.monthlyPriceRappen) : "",
                }}
                rules={{
                  minPriceRappen: settings.minPriceRappen,
                  maxPriceRappen: settings.maxPriceRappen,
                  bioMaxLength: CREATOR_BIO_MAX_LENGTH,
                  standardFeeBps: settings.standardFeeBps,
                  premiumFeeBps: settings.premiumFeeBps,
                }}
                plan="standard"
                submitLabel={reapply ? "Bewerbung erneut senden" : "Bewerbung senden"}
                pendingLabel="Wird gesendet …"
                variant="apply"
              />
            </div>
          </div>
        </section>
      </div>
    </Container>
  );
}

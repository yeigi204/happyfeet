import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Container } from "@/components/site/container";
import { NailMark } from "@/components/site/wordmark";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { formatChf, formatDateTime } from "@/lib/format";
import { requireOnboardedViewer } from "@/server/auth/viewer";
import { NotFoundError } from "@/server/errors";
import { getMockProvider } from "@/server/payments";
import { listCreatorsForExplore, type CreatorCard } from "@/server/services/creators";
import { getPremiumStatus } from "@/server/services/premium";
import { appBaseUrl, listMySubscriptions } from "@/server/services/subscriptions";

import { simulatePaymentAction } from "./actions";
import { creatorHandleFromPath, toSafeLocalPath } from "./safe-redirect";
import { SimulateButton } from "./simulate-button";

export const metadata: Metadata = { title: "Testzahlung" };

function mockProviderOrNotFound() {
  try {
    return getMockProvider();
  } catch (error) {
    // Ist ein echter Anbieter aktiv, gibt es diese Seite nicht.
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export default async function MockCheckoutPage({ params }: PageProps<"/checkout/mock/[sessionId]">) {
  const viewer = await requireOnboardedViewer();
  const { sessionId } = await params;
  const session = mockProviderOrNotFound().decodeSession(sessionId);

  if (!session) {
    return (
      <CheckoutProblem title="Dieser Checkout-Link gilt nicht mehr.">
        Checkout-Links gelten eine Stunde und lassen sich nicht verändern. Es wurde nichts verbucht – starte das Abo einfach
        nochmal auf dem Profil.
      </CheckoutProblem>
    );
  }
  if (session.payerUserId !== viewer.id) {
    return (
      <CheckoutProblem title="Diese Testzahlung gehört zu einem anderen Konto.">
        Melde dich mit dem Konto an, das den Checkout gestartet hat – oder starte ihn mit deinem Konto neu.
      </CheckoutProblem>
    );
  }

  const origin = appBaseUrl();
  const cancelHref = toSafeLocalPath(session.cancelUrl, origin) ?? "/explore";
  const isPremium = session.kind === "premium_plan";
  const handle = isPremium ? null : creatorHandleFromPath(toSafeLocalPath(session.successUrl, origin));

  // Läuft das Bezahlte schon (zweiter Tab, Zurück nach dem Bezahlen)? Dann keine zweite Zahlung anbieten –
  // sie würde nicht verbucht und nur eine falsche Erfolgsmeldung zeigen.
  if (isPremium) {
    if (viewer.creator && (await getPremiumStatus(viewer)).isPremium) {
      return (
        <CheckoutProblem
          title="Premium läuft bereits."
          actions={
            <ButtonLink href="/studio/premium" variant="primary">
              Zu Premium
            </ButtonLink>
          }
        >
          Dein Premium-Plan ist schon aktiv. Diese Testzahlung brauchst du nicht mehr – es wurde nichts verbucht.
        </CheckoutProblem>
      );
    }
  } else {
    const running = (await listMySubscriptions(viewer)).find(
      (sub) => sub.active && (sub.id === session.referenceId || (handle !== null && sub.creator.handle === handle)),
    );
    if (running) {
      return (
        <CheckoutProblem
          title="Dieses Abo läuft bereits."
          actions={
            <>
              <ButtonLink href={`/c/${running.creator.handle}`} variant="primary">
                Zu {running.creator.displayName}
              </ButtonLink>
              <ButtonLink href="/subscriptions" variant="secondary">
                Zu deinen Abos
              </ButtonLink>
            </>
          }
        >
          Du hast {running.creator.displayName} schon abonniert. Diese Testzahlung brauchst du nicht mehr – es wurde nichts
          verbucht.
        </CheckoutProblem>
      );
    }
  }

  let creator: CreatorCard | undefined;
  if (handle) {
    const matches = await listCreatorsForExplore(viewer, { query: handle, limit: 10 });
    creator = matches.find((c) => c.handle === handle);
  }

  const amount = formatChf(session.amountRappen);

  return (
    <Container className="py-10 sm:py-16">
      <div className="mx-auto max-w-xl">
        <div role="note" className="flex items-start gap-3 rounded-card border border-warning/45 bg-warning/10 px-4 py-3.5">
          <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="font-semibold text-ink">Testzahlung – es wird kein Geld bewegt</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">
              happyfeet läuft noch ohne echten Zahlungsanbieter. Dieser Schritt simuliert die Zahlung, damit du den ganzen
              Ablauf ausprobieren kannst. Keine Karte, kein Konto, keine Rechnung.
            </p>
          </div>
        </div>

        <section aria-labelledby="checkout-title" className="mt-6 rounded-card border border-line bg-surface">
          <header className="border-b border-line px-5 py-5 sm:px-6">
            <p className="eyebrow">Checkout · Simuliert</p>
            <h1 id="checkout-title" className="mt-3 font-display text-[32px] leading-[0.95] font-bold tracking-[-0.045em] sm:text-[40px]">
              Zahlung bestätigen
            </h1>
          </header>

          <div className="flex items-center gap-3.5 border-b border-line px-5 py-4 sm:px-6">
            {isPremium ? (
              <>
                <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full border border-line bg-canvas">
                  <NailMark />
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold text-ink">
                    happyfeet <PremiumBadge />
                  </p>
                  <p className="text-[13px] text-ink-muted">Plattform-Abo für Creator</p>
                </div>
              </>
            ) : creator ? (
              <>
                <span aria-hidden>
                  <Avatar name={creator.displayName} src={creator.avatarUrl} size="lg" />
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold text-ink">
                    <span className="truncate">{creator.displayName}</span>
                    {creator.isPremium ? <PremiumBadge compact /> : null}
                  </p>
                  <p className="font-mono text-[12px] text-ink-faint">@{creator.handle}</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-ink-muted">Empfänger: {session.description}</p>
            )}
          </div>

          <dl className="divide-y divide-dashed divide-line px-5 text-sm sm:px-6">
            <ReceiptLine label="Beschreibung">{session.description}</ReceiptLine>
            <ReceiptLine label="Laufzeit">1 Monat, verlängert sich automatisch</ReceiptLine>
            <ReceiptLine label="Zahlungsart">Simuliert (Mock)</ReceiptLine>
            <ReceiptLine label="Link gültig bis">
              <span className="font-mono tabular-nums">{formatDateTime(session.expiresAt)}</span>
            </ReceiptLine>
          </dl>

          <div className="flex items-end justify-between gap-4 border-t border-line px-5 py-5 sm:px-6">
            <p className="eyebrow pb-1.5">Total heute</p>
            <p className="font-mono text-[34px] leading-none font-medium tracking-[-0.04em] text-ink tabular-nums">
              <span className="mr-1.5 align-top font-sans text-[13px] font-medium tracking-normal text-ink-faint">
                {session.currency}
              </span>
              {amount.replace(/^CHF\s/, "")}
            </p>
          </div>

          <div className="grid gap-3 border-t border-line px-5 py-5 sm:px-6">
            <SimulateButton action={simulatePaymentAction.bind(null, sessionId)}>{`Zahlung simulieren · ${amount}`}</SimulateButton>
            <Link
              href={cancelHref}
              className="justify-self-center rounded-control px-2 py-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Abbrechen und zurück
            </Link>
          </div>
        </section>

        <p className="mt-5 text-center text-xs leading-relaxed text-ink-faint">
          {isPremium
            ? "Premium kannst du im Studio jederzeit zum Monatsende kündigen."
            : "Kündigen kannst du jederzeit unter „Abos“ – der Zugang bleibt bis zum Ende der bezahlten Periode."}
        </p>
      </div>
    </Container>
  );
}

function ReceiptLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

function CheckoutProblem({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <Container className="py-16 sm:py-24">
      <div className="mx-auto max-w-xl">
        <p className="eyebrow">Testzahlung</p>
        <h1 className="mt-4 font-display text-[36px] leading-[0.95] font-extrabold tracking-[-0.05em] sm:text-[48px]">{title}</h1>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-muted">{children}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          {actions ?? (
            <>
              <ButtonLink href="/explore" variant="primary">
                Creator entdecken
              </ButtonLink>
              <ButtonLink href="/subscriptions" variant="secondary">
                Zu deinen Abos
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </Container>
  );
}

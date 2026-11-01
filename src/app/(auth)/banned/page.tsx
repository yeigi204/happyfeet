import { SignOutButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { supportEmail, supportMailto } from "@/components/site/contact";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { isDevImpersonation } from "@/server/auth/dev-impersonation";
import { getViewer } from "@/server/auth/viewer";
import { getBanDetails } from "@/server/services/users";

export const metadata: Metadata = { title: "Konto gesperrt" };

export default async function BannedPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  const ban = await getBanDetails(viewer);
  if (!ban) redirect("/explore");
  const email = supportEmail();

  return (
    <section>
      <p className="font-num text-[11px] uppercase tracking-[0.22em] text-accent-strong">Konto gesperrt</p>
      <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
        Dein Konto ist gesperrt.
      </h1>
      <p className="mt-4 leading-relaxed text-ink-muted">
        Solange die Sperre besteht, kannst du auf happyfeet nichts abonnieren, melden oder veröffentlichen.
      </p>

      <dl className="mt-10 divide-y divide-line border-y border-line">
        <div className="grid gap-1 py-5 sm:grid-cols-[8rem_1fr] sm:gap-6">
          <dt className="font-num text-[11px] uppercase tracking-[0.18em] text-ink-muted sm:pt-1">Grund</dt>
          <dd className="leading-relaxed text-ink">{ban.reason?.trim() || "Kein Grund angegeben."}</dd>
        </div>
        {ban.bannedAt && (
          <div className="grid gap-1 py-5 sm:grid-cols-[8rem_1fr] sm:gap-6">
            <dt className="font-num text-[11px] uppercase tracking-[0.18em] text-ink-muted sm:pt-1">Seit</dt>
            <dd className="font-num tabular-nums text-ink">{formatDate(ban.bannedAt)}</dd>
          </div>
        )}
        {viewer.handle && (
          <div className="grid gap-1 py-5 sm:grid-cols-[8rem_1fr] sm:gap-6">
            <dt className="font-num text-[11px] uppercase tracking-[0.18em] text-ink-muted sm:pt-1">Konto</dt>
            <dd className="font-num text-ink">@{viewer.handle}</dd>
          </div>
        )}
      </dl>

      <p className="mt-8 text-sm leading-relaxed text-ink-muted">
        Du hältst das für einen Irrtum?{" "}
        {email ? (
          <>
            Schreib uns an{" "}
            <a
              href={supportMailto(email, `Sperre prüfen${viewer.handle ? ` – @${viewer.handle}` : ""}`)}
              className="font-medium text-ink underline underline-offset-4 hover:text-accent"
            >
              {email}
            </a>{" "}
            und nenne deinen Handle – wir schauen uns die Sperre noch einmal an.
          </>
        ) : (
          <>Wende dich an unseren Support und nenne deinen Handle – wir schauen uns die Sperre noch einmal an.</>
        )}
      </p>

      {!isDevImpersonation() && (
        <SignOutButton redirectUrl="/">
          <Button variant="secondary" size="lg" className="mt-8">
            Abmelden
          </Button>
        </SignOutButton>
      )}
    </section>
  );
}

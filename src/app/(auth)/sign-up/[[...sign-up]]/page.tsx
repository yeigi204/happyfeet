import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";

import { ButtonLink } from "@/components/ui/button";
import { getImpersonatedClerkId } from "@/server/auth/dev-impersonation";

export const metadata: Metadata = { title: "Konto erstellen" };

export default function SignUpPage() {
  const impersonated = getImpersonatedClerkId();
  if (impersonated) {
    return (
      <section className="border-t border-line pt-8">
        <p className="font-num text-[11px] uppercase tracking-[0.22em] text-accent-strong">Dev-Impersonation</p>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight">Registrieren ist lokal aus.</h1>
        <p className="mt-4 leading-relaxed text-ink-muted">
          Solange <span className="font-num text-ink">DEV_IMPERSONATE_CLERK_ID</span> gesetzt ist, gibt es kein Clerk
          und damit keine neuen Konten. Du bist als <span className="font-num text-ink">{impersonated}</span>{" "}
          angemeldet.
        </p>
        <ButtonLink href="/explore" variant="primary" size="lg" className="mt-8">
          Weiter zu den Creatorn
        </ButtonLink>
      </section>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <SignUp />
      <p className="max-w-sm text-center text-xs leading-relaxed text-ink-muted">
        happyfeet ist nur für Erwachsene. Nach der Registrierung bestätigst du dein Alter und wählst deinen Handle.
      </p>
    </div>
  );
}

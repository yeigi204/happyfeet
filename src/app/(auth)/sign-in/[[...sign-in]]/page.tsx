import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

import { ButtonLink } from "@/components/ui/button";
import { getImpersonatedClerkId } from "@/server/auth/dev-impersonation";

export const metadata: Metadata = { title: "Anmelden" };

export default function SignInPage() {
  const impersonated = getImpersonatedClerkId();
  if (impersonated) {
    return (
      <section className="border-t border-line pt-8">
        <p className="eyebrow text-accent-strong">Dev-Impersonation</p>
        <h1 className="mt-4 font-display text-4xl font-extrabold tracking-[-0.035em]">Du bist schon drin.</h1>
        <p className="mt-4 leading-relaxed text-ink-muted">
          Clerk ist lokal ausgeschaltet. Du bist als <span className="font-num text-ink">{impersonated}</span>{" "}
          angemeldet. Zum Wechseln <code className="font-mono text-[0.9em] text-ink">DEV_IMPERSONATE_CLERK_ID</code> in{" "}
          <code className="font-mono text-[0.9em] text-ink">.env.local</code> ändern.
        </p>
        <ButtonLink href="/explore" variant="primary" size="lg" className="mt-8">
          Weiter zu den Creatorn
        </ButtonLink>
      </section>
    );
  }

  return (
    <div className="flex justify-center">
      <SignIn />
    </div>
  );
}

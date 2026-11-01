import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";

import { getImpersonatedClerkId } from "@/server/auth/dev-impersonation";

export const metadata: Metadata = { title: "Anmelden" };

export default function SignInPage() {
  const impersonated = getImpersonatedClerkId();
  if (impersonated) {
    return (
      <section className="border-t border-line pt-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Dev-Impersonation</p>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight">Du bist schon drin.</h1>
        <p className="mt-4 leading-relaxed text-ink-muted">
          Clerk ist lokal ausgeschaltet. Du bist als <span className="font-mono text-ink">{impersonated}</span>{" "}
          angemeldet. Zum Wechseln <span className="font-mono text-ink">DEV_IMPERSONATE_CLERK_ID</span> in{" "}
          <span className="font-mono text-ink">.env.local</span> ändern.
        </p>
        <Link
          href="/explore"
          className="mt-8 inline-flex rounded-lg bg-accent px-5 py-3 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90"
        >
          Weiter zu den Creatorn
        </Link>
      </section>
    );
  }

  return (
    <div className="flex justify-center">
      <SignIn />
    </div>
  );
}

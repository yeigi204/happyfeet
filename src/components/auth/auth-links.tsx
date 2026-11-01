import Link from "next/link";
import type { ReactNode } from "react";

type AuthLinkProps = { className?: string; children?: ReactNode };

const base =
  "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Sekundärer Link zur Anmeldung (Haarlinie, kein Schatten). */
export function SignInButtonLink({ className = "", children = "Anmelden" }: AuthLinkProps) {
  return (
    <Link href="/sign-in" className={`${base} border border-line text-ink hover:border-ink ${className}`}>
      {children}
    </Link>
  );
}

/** Primärer Link zur Registrierung im Akzent. */
export function SignUpButtonLink({ className = "", children = "Konto erstellen" }: AuthLinkProps) {
  return (
    <Link href="/sign-up" className={`${base} bg-accent text-accent-ink hover:opacity-90 ${className}`}>
      {children}
    </Link>
  );
}

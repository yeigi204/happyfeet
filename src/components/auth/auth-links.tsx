import Link from "next/link";
import type { ReactNode } from "react";

import { buttonClasses } from "@/components/ui/button";

type AuthLinkProps = { className?: string; children?: ReactNode };

/** Sekundärer Link zur Anmeldung (Pille mit Rahmen). */
export function SignInButtonLink({ className, children = "Anmelden" }: AuthLinkProps) {
  return (
    <Link href="/sign-in" className={buttonClasses({ variant: "ghost", size: "sm", className })}>
      {children}
    </Link>
  );
}

/** Primärer Link zur Registrierung im Akzent. */
export function SignUpButtonLink({ className, children = "Konto erstellen" }: AuthLinkProps) {
  return (
    <Link href="/sign-up" className={buttonClasses({ variant: "primary", size: "sm", className })}>
      {children}
    </Link>
  );
}

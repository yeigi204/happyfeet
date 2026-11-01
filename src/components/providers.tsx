import { deDE } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";
import type { LocalizationResource, NextClerkProviderProps } from "@clerk/nextjs/types";
import type { ReactNode } from "react";

import { isDevImpersonation } from "@/server/auth/dev-impersonation";

type ClerkAppearance = NonNullable<NextClerkProviderProps["appearance"]>;

/** Ersetzt rekursiv „ß“ durch „ss“ (Schweizer Rechtschreibung). */
function swissSpelling<T>(value: T): T {
  if (typeof value === "string") return value.replaceAll("ß", "ss") as T;
  if (Array.isArray(value)) return value.map(swissSpelling) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, swissSpelling(v)])) as T;
  }
  return value;
}

/**
 * Clerk auf Deutsch (Schweiz): Basis `deDE`, ohne „ß“, und die Einstiegs-Screens in Du-Form
 * (deDE siezt durchgehend).
 */
export const clerkLocalization: LocalizationResource = swissSpelling({
  ...deDE,
  signIn: {
    ...deDE.signIn,
    start: {
      ...deDE.signIn?.start,
      title: "Willkommen zurück",
      titleCombined: "Willkommen zurück",
      subtitle: "Melde dich an, um weiterzumachen.",
      subtitleCombined: "Melde dich an, um weiterzumachen.",
      actionText: "Noch kein Konto?",
      actionLink: "Konto erstellen",
    },
    password: {
      ...deDE.signIn?.password,
      title: "Dein Passwort",
      subtitle: "weiter zu {{applicationName}}",
      actionLink: "Andere Methode verwenden",
    },
    emailCode: {
      ...deDE.signIn?.emailCode,
      title: "Schau in dein Postfach",
    },
    forgotPasswordAlternativeMethods: {
      ...deDE.signIn?.forgotPasswordAlternativeMethods,
      label__alternativeMethods: "Oder melde dich anders an",
    },
  },
  signUp: {
    ...deDE.signUp,
    start: {
      ...deDE.signUp?.start,
      title: "Konto erstellen",
      titleCombined: "Konto erstellen",
      subtitle: "Ein Konto für alle deine Abos.",
      subtitleCombined: "Ein Konto für alle deine Abos.",
      actionText: "Schon ein Konto?",
      actionLink: "Anmelden",
    },
    emailCode: {
      ...deDE.signUp?.emailCode,
      title: "Bestätige deine E-Mail",
      formSubtitle: "Gib den Code ein, den wir dir per E-Mail geschickt haben.",
    },
    continue: {
      ...deDE.signUp?.continue,
      title: "Fast geschafft",
      actionText: "Schon ein Konto?",
      actionLink: "Anmelden",
    },
  },
});

/** An die hellen Design-Tokens angelehnt (Puder & Creme, ein Akzent Nagellack-Rot, Haarlinien statt Schatten). */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#d7352a",
    colorPrimaryForeground: "#fffaf4",
    colorBackground: "#fffaf4",
    colorForeground: "#1d1714",
    colorMutedForeground: "#6f625a",
    colorNeutral: "#1d1714",
    colorInput: "#fffaf4",
    colorInputForeground: "#1d1714",
    colorDanger: "#b4261c",
    colorShadow: "transparent",
    fontFamily: "var(--font-geist), ui-sans-serif, system-ui, sans-serif",
    fontFamilyButtons: "var(--font-geist), ui-sans-serif, system-ui, sans-serif",
    fontFamilyMono: "var(--font-geist-mono), ui-monospace, monospace",
    borderRadius: "0.625rem",
  },
  elements: {
    cardBox: "shadow-none border border-line rounded-2xl",
    card: "shadow-none",
    headerTitle: "font-display text-2xl tracking-tight",
    formButtonPrimary: "shadow-none",
    footer: "bg-canvas",
  },
} satisfies ClerkAppearance;

/**
 * Globale Provider (Root-Layout, Server Component).
 * Bei Dev-Impersonation ohne Clerk – dann gibt es keine Clerk-Session und keinen Clerk-Aufruf.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  if (isDevImpersonation()) return <>{children}</>;
  return (
    <ClerkProvider
      localization={clerkLocalization}
      appearance={clerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/feed"
      signUpFallbackRedirectUrl="/onboarding"
      afterSignOutUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}

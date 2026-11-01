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

/**
 * Clerk im Rosé-Look. `cssLayerName: "clerk"` legt Clerks Stile in den Layer `clerk` (Reihenfolge in globals.css:
 * theme, base, clerk, components, utilities) – Token-Klassen in `elements` gewinnen damit ohne `!`.
 * Farben laufen über Token-Klassen und folgen so Hell und Dunkel; `variables` sind nur feste Fallbacks
 * (Clerk erwartet dort konkrete Farbwerte).
 */
export const clerkAppearance = {
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "#c2185b",
    colorPrimaryForeground: "#ffffff",
    colorDanger: "#c62828",
    colorShadow: "transparent",
    fontFamily: "var(--font-jakarta), ui-sans-serif, system-ui, sans-serif",
    fontFamilyButtons: "var(--font-jakarta), ui-sans-serif, system-ui, sans-serif",
    borderRadius: "14px",
  },
  elements: {
    cardBox: "rounded-panel border border-line shadow-lg",
    card: "bg-surface text-ink shadow-none",
    headerTitle: "font-display text-2xl font-extrabold tracking-tight text-ink",
    headerSubtitle: "text-ink-muted",
    socialButtonsBlockButton: "border-line-strong bg-surface text-ink hover:bg-surface-2",
    socialButtonsBlockButtonText: "text-ink",
    dividerLine: "bg-line",
    dividerText: "text-ink-muted",
    formFieldLabel: "font-semibold text-ink",
    formFieldInput: "rounded-control border-line-strong bg-surface text-ink",
    formFieldAction: "text-accent-strong",
    formButtonPrimary: "rounded-full bg-accent text-accent-ink shadow-none",
    otpCodeFieldInput: "border-line-strong bg-surface text-ink",
    identityPreview: "border-line bg-surface-2",
    identityPreviewText: "text-ink",
    alertText: "text-ink",
    footer: "bg-surface-2",
    footerActionText: "text-ink-muted",
    footerActionLink: "font-semibold text-accent-strong",
    userButtonPopoverCard: "border border-line bg-surface text-ink shadow-lg",
    userButtonPopoverActionButton: "text-ink hover:bg-surface-2",
    userButtonPopoverActionButtonText: "text-ink",
    userButtonPopoverFooter: "bg-surface-2",
    userPreviewMainIdentifier: "text-ink",
    userPreviewSecondaryIdentifier: "text-ink-muted",
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

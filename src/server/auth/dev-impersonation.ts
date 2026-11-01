import "server-only";

/**
 * Dev-Impersonation: umgeht Clerk und meldet den Seed-User mit dieser Clerk-ID an
 * (lokale Entwicklung, Screenshots). Wirkt nie in Produktion – ist die Variable dort
 * gesetzt, ist das eine Fehlkonfiguration und wir brechen hart ab, statt still jemanden anzumelden.
 */
export function getImpersonatedClerkId(): string | null {
  const clerkId = process.env.DEV_IMPERSONATE_CLERK_ID?.trim();
  if (!clerkId) return null;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DEV_IMPERSONATE_CLERK_ID ist in Produktion gesetzt. Die Variable ist nur für die lokale Entwicklung gedacht – bitte entfernen.",
    );
  }
  return clerkId;
}

export function isDevImpersonation(): boolean {
  return getImpersonatedClerkId() !== null;
}

/**
 * Nur Dev: Cookie, mit dem man auf einem laufenden Dev-Server die Identität wechseln kann
 * (z. B. Playwright-Screenshots als Admin, Creator, Fan oder abgemeldet), ohne den Server neu zu starten.
 * Wird nur ausgewertet, wenn Dev-Impersonation ohnehin aktiv ist.
 */
export const DEV_IMPERSONATE_COOKIE = "hf_dev_as";
/** Cookie-Wert für „abgemeldet“. */
export const DEV_IMPERSONATE_ANONYMOUS = "anon";

const SEED_CLERK_ID = /^seed_[a-z0-9_]{1,40}$/;

/**
 * Ermittelt die effektive Dev-Identität: `null` = abgemeldet, sonst eine Clerk-ID.
 * Ungültige Cookie-Werte werden ignoriert (Fallback auf die Env-Variable).
 */
export function resolveDevIdentity(envClerkId: string, cookieValue: string | undefined): string | null {
  if (cookieValue === DEV_IMPERSONATE_ANONYMOUS) return null;
  if (cookieValue && SEED_CLERK_ID.test(cookieValue)) return cookieValue;
  return envClerkId;
}

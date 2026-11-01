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

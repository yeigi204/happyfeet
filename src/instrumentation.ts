/**
 * Wird einmal beim Start einer Next.js-Serverinstanz ausgeführt.
 * Verhindert, dass eine unsichere Konfiguration (Dev-Impersonation, Platzhalter-Secrets, lokaler Storage)
 * in Produktion überhaupt Anfragen annimmt.
 */
export async function register() {
  // Während `next build` nicht prüfen – dort fehlen Laufzeit-Secrets legitimerweise.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { assertProductionConfig } = await import("@/server/config/production-check");
  assertProductionConfig();
}

/**
 * Harte Konfigurationsprüfung beim Serverstart (siehe src/instrumentation.ts).
 * Rein und ohne Seiteneffekte, damit sie testbar ist.
 */

const PLACEHOLDER_MARKERS = ["change-me", "dev-only", "changeme"];

const SECRET_VARS = ["MEDIA_SIGNING_SECRET", "PAYMENT_WEBHOOK_SECRET"] as const;

/**
 * Simulierte Zahlungen (Mock-Provider) in Produktion nur mit diesem ausdrücklichen Opt-in (z. B. Staging).
 * Sonst schaltet „Zahlung simulieren“ Abos und Premium gratis frei, und Schein-Umsätze würden ausbezahlt.
 */
export const ALLOW_MOCK_PAYMENTS_ENV = "ALLOW_MOCK_PAYMENTS_IN_PRODUCTION";

/** Ist der Mock-Zahlungsanbieter in dieser Umgebung erlaubt? Ausserhalb von Produktion immer. */
export function mockPaymentsAllowed(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV !== "production" || env[ALLOW_MOCK_PAYMENTS_ENV] === "true";
}

export function productionConfigProblems(env: Record<string, string | undefined>): string[] {
  if (env.NODE_ENV !== "production") return [];
  const problems: string[] = [];

  if (env.DEV_IMPERSONATE_CLERK_ID) {
    problems.push("DEV_IMPERSONATE_CLERK_ID darf in Produktion nicht gesetzt sein.");
  }
  if (env.STORAGE_DRIVER === "local") {
    problems.push("STORAGE_DRIVER=local ist nur für die Entwicklung gedacht – in Produktion 'supabase' verwenden.");
  }
  // Ohne PAYMENT_PROVIDER greift der Standard `mock` (src/server/payments/index.ts).
  const paymentProvider = env.PAYMENT_PROVIDER?.trim() || "mock";
  if (paymentProvider === "mock" && !mockPaymentsAllowed(env)) {
    problems.push(
      `PAYMENT_PROVIDER ist 'mock' (auch der Standard, wenn nicht gesetzt): simulierte Zahlungen schalten Abos gratis frei – echten Provider setzen oder nur für Staging ${ALLOW_MOCK_PAYMENTS_ENV}=true.`,
    );
  }
  for (const name of SECRET_VARS) {
    const value = env[name];
    if (!value) continue; // Nur prüfen, wenn genutzt – fehlende Secrets melden die jeweiligen Module selbst.
    if (value.length < 32 || PLACEHOLDER_MARKERS.some((m) => value.toLowerCase().includes(m))) {
      problems.push(`${name} ist zu kurz oder ein Platzhalter – ein zufälliges Secret (min. 32 Zeichen) setzen.`);
    }
  }
  return problems;
}

export function assertProductionConfig(env: Record<string, string | undefined> = process.env): void {
  const problems = productionConfigProblems(env);
  if (problems.length > 0) {
    throw new Error(`Unsichere Produktionskonfiguration:\n- ${problems.join("\n- ")}`);
  }
}

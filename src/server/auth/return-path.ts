import "server-only";

/**
 * Rücksprung nach Anmeldung/Onboarding. Der Proxy (src/proxy.ts) setzt den aktuellen Pfad bei jeder
 * Anfrage in diesen Request-Header (ein vom Client mitgeschickter Wert wird überschrieben);
 * `requireViewer()`/`requireOnboardedViewer()` hängen ihn als `?redirect_url=` an.
 */
export const RETURN_PATH_HEADER = "x-hf-return-path";

const MAX_RETURN_PATH_LENGTH = 2048;
/** Next-interne Query-Parameter, die nicht in einen Rücksprung gehören. */
const INTERNAL_PARAMS = ["_rsc"];
/** Ziele, auf die ein Rücksprung im Kreis führen würde. */
const NO_RETURN_PREFIXES = ["/sign-in", "/sign-up", "/onboarding"];

/** Pfad + Query einer Anfrage-URL, ohne Next-interne Parameter. */
export function returnPathFromUrl(url: URL): string {
  const params = new URLSearchParams(url.search);
  for (const name of INTERNAL_PARAMS) params.delete(name);
  const query = params.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

/**
 * Nur lokale, sinnvolle Rücksprünge: beginnt mit genau einem `/` (kein `//` oder `/\` → fremde Domain),
 * keine Steuer- oder Leerzeichen, nicht die Startseite und keine Anmelde-/Onboarding-Seite.
 */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length < 2 || value.length > MAX_RETURN_PATH_LENGTH) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\s\u0000-\u001F\u007F\\]/.test(value)) return null;
  const pathname = value.split(/[?#]/, 1)[0];
  if (NO_RETURN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return null;
  return value;
}

/** `target?redirect_url=<returnPath>` – ohne gültigen Rücksprung einfach `target`. */
export function withReturnPath(target: string, returnPath: string | null | undefined): string {
  const safe = safeReturnPath(returnPath);
  return safe ? `${target}?redirect_url=${encodeURIComponent(safe)}` : target;
}

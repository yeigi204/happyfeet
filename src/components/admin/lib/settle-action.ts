import type { ActionResult } from "@/server/errors";

export const ACTION_NETWORK_ERROR = "Keine Antwort vom Server – bitte prüfe deine Verbindung und versuch es nochmals.";

/** Next.js-Kontrollfluss (redirect/notFound) erkennt man am `digest` – den nie verschlucken. */
function isNextControlFlow(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string" && error.digest.startsWith("NEXT_");
}

/**
 * Wartet auf eine Server Action und macht aus einem abgebrochenen Request (offline, Server-Neustart)
 * ein normales Fehler-Ergebnis. Sonst würde der Fehler aus der Transition bis zur Fehlergrenze
 * durchschlagen und die ganze Admin-Ansicht ersetzen, statt im Dialog bzw. als Meldung zu erscheinen.
 */
export async function settleAction<T>(pending: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await pending;
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    console.warn("[admin] Server Action ohne Antwort", error);
    return { ok: false, error: ACTION_NETWORK_ERROR };
  }
}

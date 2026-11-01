import "server-only";

import { unstable_rethrow } from "next/navigation";

import { AppError, ValidationError, type ActionResult } from "./errors";

export type { ActionResult } from "./errors";

/**
 * Führt einen Use-Case in einer Server Action aus und übersetzt erwartbare Fehler
 * in ein serialisierbares Ergebnis. Next.js-Kontrollfluss (redirect/notFound) wird durchgereicht,
 * unerwartete Fehler werden geloggt und generisch beantwortet.
 */
export async function toActionResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ValidationError) {
      return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
    }
    if (error instanceof AppError) {
      return { ok: false, error: error.message };
    }
    console.error("[action] unerwarteter Fehler", error);
    return { ok: false, error: "Etwas ist schiefgelaufen. Bitte versuche es erneut." };
  }
}

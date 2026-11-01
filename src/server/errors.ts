import { unstable_rethrow } from "next/navigation";

/** Basisklasse für erwartbare Fehler aus Services. `message` ist nutzer-tauglich (deutsch). */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
  }
}

export class AuthError extends AppError {
  constructor(message = "Bitte melde dich an.") {
    super("unauthenticated", 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Dafür fehlt dir die Berechtigung.") {
    super("forbidden", 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Nicht gefunden.") {
    super("not_found", 404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("conflict", 409, message);
  }
}

export type FieldErrors = Record<string, string[]>;

export class ValidationError extends AppError {
  readonly fieldErrors: FieldErrors;
  constructor(message: string, fieldErrors: FieldErrors = {}) {
    super("validation", 422, message);
    this.fieldErrors = fieldErrors;
  }
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

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

/** Wandelt zod-Fehler in FieldErrors um. */
export function zodFieldErrors(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

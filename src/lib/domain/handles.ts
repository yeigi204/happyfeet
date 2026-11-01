export const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/;

const MIN_LENGTH = 3;
const MAX_LENGTH = 24;

/** Routen, Rollen und Markennamen, die niemand als Handle bekommt. */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  // Routen
  "admin",
  "studio",
  "explore",
  "feed",
  "api",
  "c",
  "sign-in",
  "sign-up",
  "sign_in",
  "sign_up",
  "onboarding",
  "banned",
  "settings",
  "account",
  "login",
  "logout",
  "checkout",
  "billing",
  "premium",
  "media",
  // Rollen & Support
  "support",
  "help",
  "hilfe",
  "moderator",
  "mod",
  "staff",
  "team",
  "official",
  "root",
  "system",
  // Marke & Rechtliches
  "happyfeet",
  "happy_feet",
  "impressum",
  "datenschutz",
  "agb",
  "kontakt",
  "contact",
  "privacy",
  "terms",
  "legal",
  // technisch
  "www",
  "null",
  "undefined",
]);

/** „  @Foot_Lover “ → „foot_lover“. */
export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@/, "").toLowerCase();
}

/** Prüft einen bereits normalisierten Handle. */
export function validateHandle(handle: string): { ok: true } | { ok: false; reason: string } {
  if (handle.length < MIN_LENGTH) return { ok: false, reason: `Mindestens ${MIN_LENGTH} Zeichen.` };
  if (handle.length > MAX_LENGTH) return { ok: false, reason: `Höchstens ${MAX_LENGTH} Zeichen.` };
  if (!HANDLE_PATTERN.test(handle)) {
    return { ok: false, reason: "Nur Kleinbuchstaben (a–z), Ziffern und _ erlaubt." };
  }
  if (RESERVED_HANDLES.has(handle)) return { ok: false, reason: "Dieser Name ist reserviert." };
  return { ok: true };
}

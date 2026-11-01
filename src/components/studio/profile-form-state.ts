import type { FieldErrors } from "@/server/errors";

/**
 * Formularzustand für Bio + Monatspreis (Bewerbung und Einstellungen).
 * Rein (keine Server-Abhängigkeit) – wird von Server Actions und dem Client-Formular geteilt.
 */

export type ProfileField = "bio" | "price";

export type ProfileFormValues = { bio: string; price: string };

export type ProfileFormState =
  | { status: "idle" }
  | { status: "error"; error: string; fieldErrors: Partial<Record<ProfileField, string>>; values: ProfileFormValues }
  | { status: "saved"; savedAt: number; values: ProfileFormValues };

export const PROFILE_FORM_IDLE: ProfileFormState = { status: "idle" };

export const PRICE_FORMAT_ERROR = "Bitte gib den Preis in Franken an, z. B. 9.90.";

export function readProfileForm(formData: FormData): ProfileFormValues {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return { bio: text("bio"), price: text("price") };
}

/** Service-Feldnamen → Formularfelder (`monthlyPriceRappen` heisst im Formular `price`). */
export function toProfileFieldErrors(fieldErrors: FieldErrors | undefined): Partial<Record<ProfileField, string>> {
  const out: Partial<Record<ProfileField, string>> = {};
  if (!fieldErrors) return out;
  const bio = fieldErrors.bio?.[0];
  const price = fieldErrors.monthlyPriceRappen?.[0] ?? fieldErrors.price?.[0];
  if (bio) out.bio = bio;
  if (price) out.price = price;
  return out;
}

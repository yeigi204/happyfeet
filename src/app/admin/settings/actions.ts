"use server";

import { parseHundredths, parseWholeNumber } from "@/components/admin/lib/decimal-input";
import { ValidationError, type FieldErrors } from "@/server/errors";
import { updatePlatformSettings } from "@/server/services/admin/settings";

import { runAdminAction } from "../_lib/admin-action";

export type SettingsField = "standardFeeBps" | "premiumFeeBps" | "premiumPriceRappen" | "minPriceRappen" | "maxPriceRappen" | "premoderationCount";

export type SettingsFormState = {
  status: "idle" | "saved" | "error";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Zeitpunkt des Speicherns (jede Speicherung ein neuer Wert → Bestätigung im Client). */
  savedAt?: number;
};

/** Franken/Prozent → Hundertstel (Rappen bzw. bps). */
const HUNDREDTHS_FIELDS = ["standardFeeBps", "premiumFeeBps", "premiumPriceRappen", "minPriceRappen", "maxPriceRappen"] as const;

/**
 * Speichert die Plattform-Einstellungen. Eingaben kommen in Prozent bzw. Franken und werden hier exakt
 * (ohne Fliesskomma) in bps bzw. Rappen umgerechnet; die fachliche Prüfung macht der Service.
 */
export async function saveSettingsAction(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  // Erst Admin prüfen (in `runAdminAction`), dann Eingaben lesen – Nicht-Admins bekommen nie Feld-Feedback.
  const result = await runAdminAction((admin) => updatePlatformSettings(admin, parseSettingsForm(formData)));
  if (!result.ok) return { status: "error", message: result.error, fieldErrors: result.fieldErrors };
  return { status: "saved", savedAt: Date.now() };
}

/** Formular → bps/Rappen; ungültige Eingaben werfen einen `ValidationError` mit Fehlern pro Feld. */
function parseSettingsForm(formData: FormData): Partial<Record<SettingsField, number>> {
  const fieldErrors: FieldErrors = {};
  const input: Partial<Record<SettingsField, number>> = {};

  for (const field of HUNDREDTHS_FIELDS) {
    const parsed = parseHundredths(formData.get(field));
    if (parsed.ok) input[field] = parsed.hundredths;
    else fieldErrors[field] = [parsed.reason];
  }
  const premoderation = parseWholeNumber(formData.get("premoderationCount"));
  if (premoderation.ok) input.premoderationCount = premoderation.value;
  else fieldErrors.premoderationCount = [premoderation.reason];

  if (Object.keys(fieldErrors).length > 0) throw new ValidationError("Bitte prüfe die markierten Felder.", fieldErrors);
  return input;
}

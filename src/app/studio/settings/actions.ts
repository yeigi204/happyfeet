"use server";

import { revalidatePath } from "next/cache";

import { parseChfInput } from "@/components/studio/price";
import {
  PRICE_FORMAT_ERROR,
  readProfileForm,
  toProfileFieldErrors,
  type ProfileFormState,
} from "@/components/studio/profile-form-state";
import { toActionResult } from "@/server/action-result";
import { requireCreator } from "@/server/auth/viewer";
import { updateCreatorProfile } from "@/server/services/creators";

/** Bio und Monatspreis speichern. Der neue Preis gilt nur für neue Abos (Preis-Snapshot pro Abo). */
export async function updateCreatorProfileAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  void _prev;
  const viewer = await requireCreator();
  const values = readProfileForm(formData);

  const monthlyPriceRappen = parseChfInput(values.price);
  if (monthlyPriceRappen === null) {
    return { status: "error", error: "Bitte prüfe deine Angaben.", fieldErrors: { price: PRICE_FORMAT_ERROR }, values };
  }

  const result = await toActionResult(() => updateCreatorProfile(viewer, { bio: values.bio, monthlyPriceRappen }));
  if (!result.ok) {
    return { status: "error", error: result.error, fieldErrors: toProfileFieldErrors(result.fieldErrors), values };
  }

  revalidatePath("/studio", "layout");
  revalidatePath("/c/[handle]", "page");
  revalidatePath("/explore");
  return { status: "saved", savedAt: Date.now(), values };
}

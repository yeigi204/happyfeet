"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseChfInput } from "@/components/studio/price";
import {
  PRICE_FORMAT_ERROR,
  readProfileForm,
  toProfileFieldErrors,
  type ProfileFormState,
} from "@/components/studio/profile-form-state";
import { toActionResult } from "@/server/action-result";
import { requireOnboardedViewer } from "@/server/auth/viewer";
import { applyAsCreator } from "@/server/services/creators";

/**
 * Bewerbung als Creator. Der Viewer kommt frisch aus der Session; der Service prüft Rahmen, Länge
 * und ob schon eine (nicht abgelehnte) Bewerbung existiert.
 */
export async function applyAsCreatorAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  void _prev;
  const viewer = await requireOnboardedViewer();
  const values = readProfileForm(formData);

  const monthlyPriceRappen = parseChfInput(values.price);
  if (monthlyPriceRappen === null) {
    return { status: "error", error: "Bitte prüfe deine Angaben.", fieldErrors: { price: PRICE_FORMAT_ERROR }, values };
  }

  const result = await toActionResult(() => applyAsCreator(viewer, { bio: values.bio, monthlyPriceRappen }));
  if (!result.ok) {
    return { status: "error", error: result.error, fieldErrors: toProfileFieldErrors(result.fieldErrors), values };
  }

  revalidatePath("/studio", "layout");
  redirect("/studio");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { toActionResult, type ActionResult } from "@/server/action-result";
import { requireCreator } from "@/server/auth/viewer";
import { cancelPremium, startPremiumCheckout } from "@/server/services/premium";

export type PremiumActionState = ActionResult<void> | null;

/** Startet den Premium-Checkout und leitet zum Zahlungsanbieter (Dev: Mock-Checkout) weiter. */
export async function startPremiumCheckoutAction(_state: PremiumActionState, _formData: FormData): Promise<PremiumActionState> {
  void _state;
  void _formData;
  const viewer = await requireCreator();
  const result = await toActionResult(() => startPremiumCheckout(viewer));
  if (!result.ok) return result;
  redirect(result.data.redirectUrl);
}

/** Kündigt Premium zum Periodenende – bis dahin bleiben alle Vorteile. */
export async function cancelPremiumAction(_state: PremiumActionState, _formData: FormData): Promise<PremiumActionState> {
  void _state;
  void _formData;
  const viewer = await requireCreator();
  const result = await toActionResult(() => cancelPremium(viewer));
  if (result.ok) revalidatePath("/studio", "layout");
  return result;
}

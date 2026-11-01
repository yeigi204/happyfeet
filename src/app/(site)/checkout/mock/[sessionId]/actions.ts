"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionResult } from "@/server/action-result";
import { toActionResult } from "@/server/action-result";
import { requireOnboardedViewer } from "@/server/auth/viewer";
import { ValidationError } from "@/server/errors";
import { getMockProvider } from "@/server/payments";
import { completeMockCheckout } from "@/server/services/payment-events";
import { appBaseUrl } from "@/server/services/subscriptions";

import { toSafeLocalPath } from "./safe-redirect";

export type SimulateState = ActionResult<null> | null;

const EXPIRED = "Diese Testzahlung ist ungültig oder abgelaufen. Bitte starte den Checkout neu.";

/**
 * „Zahlung simulieren“: verbucht die Mock-Zahlung (idempotent – ein Doppelklick ergibt genau eine
 * Zahlung) und leitet zum Rücksprung-Ziel der Session weiter, aber nur innerhalb der App.
 */
export async function simulatePaymentAction(sessionId: string, _state: SimulateState, _formData: FormData): Promise<SimulateState> {
  void _state;
  void _formData;
  const viewer = await requireOnboardedViewer();
  const result = await toActionResult(async () => {
    const session = getMockProvider().decodeSession(sessionId);
    if (!session) throw new ValidationError(EXPIRED);
    const completed = await completeMockCheckout(viewer, sessionId);
    return { successUrl: session.successUrl, ...completed };
  });
  if (!result.ok) return result;

  const { successUrl, kind, creatorHandle } = result.data;
  const fallback =
    kind === "premium_plan" ? "/studio/premium" : creatorHandle ? `/c/${creatorHandle}?abo=ok` : "/subscriptions";
  const target = toSafeLocalPath(successUrl, appBaseUrl()) ?? fallback;

  revalidatePath("/feed");
  revalidatePath("/subscriptions");
  revalidatePath("/c/[handle]", "page");
  revalidatePath("/studio", "layout");
  redirect(target);
}

"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/server/action-result";
import { toActionResult } from "@/server/action-result";
import { requireOnboardedViewer } from "@/server/auth/viewer";
import { cancelSubscription } from "@/server/services/subscriptions";

export type CancelState = ActionResult<void> | null;

/**
 * Kündigt ein eigenes Abo zum Periodenende. `subscriptionId` ist nur das Ziel – der Service prüft,
 * dass das Abo dem frisch aus der Session geladenen Viewer gehört.
 */
export async function cancelSubscriptionAction(subscriptionId: string, _state: CancelState, _formData: FormData): Promise<CancelState> {
  void _state;
  void _formData;
  const viewer = await requireOnboardedViewer();
  const result = await toActionResult(() => cancelSubscription(viewer, subscriptionId));
  if (result.ok) {
    revalidatePath("/subscriptions");
    revalidatePath("/feed");
    revalidatePath("/c/[handle]", "page");
  }
  return result;
}

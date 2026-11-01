"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import type { ReportState } from "@/components/posts/report-dialog";
import type { SubscribeState } from "@/components/posts/subscribe-button";
import { REPORT_REASONS } from "@/lib/domain/reports";
import type { ReportReason } from "@/lib/domain/types";
import { toActionResult } from "@/server/action-result";
import { requireOnboardedViewer } from "@/server/auth/viewer";
import { ValidationError, zodFieldErrors } from "@/server/errors";
import { reportPost } from "@/server/services/reports";
import { startSubscriptionCheckout } from "@/server/services/subscriptions";

/**
 * Abo abschliessen: Checkout beim Zahlungsanbieter starten und dorthin weiterleiten.
 * `creatorId` ist das Ziel (nicht die Identität) – der Viewer kommt immer frisch aus der Session.
 * Gäste landen bei der Anmeldung, ohne Onboarding beim Onboarding, Gesperrte auf der Sperrseite.
 */
export async function startCheckoutAction(creatorId: string, _state: SubscribeState, _formData: FormData): Promise<SubscribeState> {
  void _state;
  void _formData;
  const viewer = await requireOnboardedViewer();
  const result = await toActionResult(() => startSubscriptionCheckout(viewer, { creatorId }));
  if (!result.ok) return result;
  redirect(result.data.redirectUrl);
}

const reasons = Object.keys(REPORT_REASONS) as [ReportReason, ...ReportReason[]];

const reportSchema = z.object({
  postId: z.string({ error: "Dieser Post wurde nicht gefunden." }).min(1, "Dieser Post wurde nicht gefunden."),
  reason: z.enum(reasons, { error: "Bitte wähle einen Grund für die Meldung." }),
  details: z.string().optional(),
});

/** Post melden (eine offene Meldung pro Nutzer und Post). */
export async function reportPostAction(_state: ReportState, formData: FormData): Promise<ReportState> {
  void _state;
  const viewer = await requireOnboardedViewer();
  return toActionResult(async () => {
    const parsed = reportSchema.safeParse({
      postId: formData.get("postId") ?? undefined,
      reason: formData.get("reason") || undefined,
      details: formData.get("details") ?? undefined,
    });
    if (!parsed.success) {
      throw new ValidationError("Bitte prüfe deine Angaben.", zodFieldErrors(parsed.error.issues));
    }
    return reportPost(viewer, parsed.data);
  });
}

"use server";

import { generateDuePayouts, markPayoutPaid } from "@/server/services/admin/payouts";

import { runAdminAction, textValue } from "../_lib/admin-action";

/** Auszahlungen für alle abgeschlossenen Perioden anlegen (idempotent). */
export async function generateDuePayoutsAction() {
  return runAdminAction((admin) => generateDuePayouts(admin));
}

/** Geplante Auszahlung als bezahlt markieren. */
export async function markPayoutPaidAction(payoutId: string) {
  return runAdminAction((admin) => markPayoutPaid(admin, textValue(payoutId)));
}

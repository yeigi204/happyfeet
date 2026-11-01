import "server-only";

import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { PayoutSchedule, Viewer } from "@/lib/domain/types";
import { assertAdmin } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { payouts, users, type Payout } from "@/server/db/schema";
import { ValidationError, zodFieldErrors } from "@/server/errors";
import { premiumCreatorIdsAt } from "@/server/services/premium";

export { generateDuePayouts, markPayoutPaid } from "@/server/services/payouts";

export type AdminPayoutRow = {
  id: string;
  creator: { userId: string; handle: string | null; displayName: string | null; isPremium: boolean };
  amountRappen: number;
  schedule: PayoutSchedule;
  periodStart: Date;
  periodEnd: Date;
  status: Payout["status"];
  createdAt: Date;
  paidAt: Date | null;
};

const listInputSchema = z
  .object({ status: z.enum(["scheduled", "paid", "failed"]).optional() })
  .optional();

/** Alle Auszahlungen (optional nach Status), neueste Periode zuerst – nur Admin. */
export async function listPayouts(
  admin: Viewer,
  input?: { status?: "scheduled" | "paid" | "failed" },
  opts: { now?: Date } = {},
): Promise<AdminPayoutRow[]> {
  assertAdmin(admin);
  const now = opts.now ?? new Date();
  const parsed = listInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Ungültiger Filter.", zodFieldErrors(parsed.error.issues));
  }
  const status = parsed.data?.status;

  const db = getDb();
  const rows = await db
    .select({ payout: payouts, handle: users.handle, displayName: users.displayName })
    .from(payouts)
    .innerJoin(users, eq(users.id, payouts.creatorId))
    .where(status ? eq(payouts.status, status) : undefined)
    .orderBy(desc(payouts.periodEnd), desc(payouts.createdAt));

  const premium = await premiumCreatorIdsAt(
    rows.map((row) => row.payout.creatorId),
    now,
    db,
  );

  return rows.map(({ payout, handle, displayName }) => ({
    id: payout.id,
    creator: { userId: payout.creatorId, handle, displayName, isPremium: premium.has(payout.creatorId) },
    amountRappen: payout.amountRappen,
    schedule: payout.schedule,
    periodStart: payout.periodStart,
    periodEnd: payout.periodEnd,
    status: payout.status,
    createdAt: payout.createdAt,
    paidAt: payout.paidAt,
  }));
}

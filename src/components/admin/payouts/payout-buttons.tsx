"use client";

import { CircleCheck, LoaderCircle, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

import { generateDuePayoutsAction, markPayoutPaidAction } from "@/app/admin/payouts/actions";
import { Button } from "@/components/ui/button";
import { formatChf, formatNumber } from "@/lib/format";

import { ActionDialog } from "../action-dialog";
import { settleAction } from "../lib/settle-action";
import { toast } from "../toast";

/** „Fällige erzeugen“: legt Auszahlungen für abgeschlossene Perioden an. Doppelte gibt es nicht. */
export function GeneratePayoutsButton() {
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const result = await settleAction(generateDuePayoutsAction());
      if (!result.ok) {
        toast({ tone: "danger", title: "Auszahlungen nicht erzeugt", description: result.error });
        return;
      }
      const { created, totalRappen } = result.data;
      toast(
        created === 0
          ? { tone: "neutral", title: "Nichts fällig", description: "Alle abgeschlossenen Perioden sind bereits erfasst." }
          : {
              tone: "success",
              title: created === 1 ? "1 Auszahlung erzeugt" : `${formatNumber(created)} Auszahlungen erzeugt`,
              description: `Zusammen ${formatChf(totalRappen)} – jetzt unter «Geplant».`,
            },
      );
    });

  return (
    <Button variant="primary" size="sm" onClick={run} disabled={pending}>
      {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <RefreshCw aria-hidden />}
      Fällige erzeugen
    </Button>
  );
}

export type MarkPaidButtonProps = { payoutId: string; amountRappen: number; creatorLabel: string; periodLabel: string };

/** „Als bezahlt markieren“ – erst nach der Überweisung, deshalb mit Bestätigung. */
export function MarkPaidButton({ payoutId, amountRappen, creatorLabel, periodLabel }: MarkPaidButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} className="max-sm:w-8 max-sm:px-0">
        <CircleCheck aria-hidden />
        {/* Mobil nur das Häkchen – der Text bleibt für Screenreader. */}
        <span className="max-sm:sr-only">Als bezahlt markieren</span>
        <span className="sr-only">
          {" "}
          – {creatorLabel}, {periodLabel}
        </span>
      </Button>
      {open ? (
        <ActionDialog
          title={`${formatChf(amountRappen)} an ${creatorLabel} bezahlt?`}
          description={
            <>
              Periode {periodLabel}. Bestätige erst, wenn das Geld überwiesen ist – der Schritt lässt sich nicht rückgängig machen und erscheint im Studio
              des Creators.
            </>
          }
          confirmLabel="Als bezahlt markieren"
          onConfirm={() => markPayoutPaidAction(payoutId)}
          onDone={() => toast({ tone: "success", title: "Auszahlung als bezahlt markiert", description: `${formatChf(amountRappen)} an ${creatorLabel}` })}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

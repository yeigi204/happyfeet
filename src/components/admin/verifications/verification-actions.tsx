"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { useState, useTransition } from "react";

import { approveCreatorAction, rejectCreatorAction } from "@/app/admin/verifications/actions";
import { Button } from "@/components/ui/button";

import { ActionDialog } from "../action-dialog";
import { settleAction } from "../lib/settle-action";
import { toast } from "../toast";

export type VerificationActionsProps = { userId: string; handle: string; canApprove: boolean };

/** Freigeben (sofort) und Ablehnen (mit Pflicht-Begründung im Dialog). */
export function VerificationActions({ userId, handle, canApprove }: VerificationActionsProps) {
  const [rejecting, setRejecting] = useState(false);
  const [pending, startTransition] = useTransition();
  const [decided, setDecided] = useState<"approved" | "rejected" | null>(null);

  const approve = () => {
    startTransition(async () => {
      const result = await settleAction(approveCreatorAction(userId));
      if (result.ok) {
        setDecided("approved");
        toast({ tone: "success", title: `@${handle} ist freigeschaltet`, description: "Das Profil ist ab sofort auf Entdecken sichtbar." });
      } else {
        toast({ tone: "danger", title: "Freigabe nicht möglich", description: result.error });
      }
    });
  };

  if (decided) {
    return (
      <p role="status" className="flex h-8 items-center gap-2 text-[13px] text-ink-muted">
        {decided === "approved" ? <Check aria-hidden className="size-4 text-success" /> : <X aria-hidden className="size-4 text-danger" />}
        {decided === "approved" ? "Freigegeben" : "Abgelehnt"}
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={approve} disabled={pending || !canApprove}>
          {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Check aria-hidden />}
          Freigeben
        </Button>
        <Button variant="danger" size="sm" onClick={() => setRejecting(true)} disabled={pending}>
          <X aria-hidden />
          Ablehnen
        </Button>
      </div>
      {rejecting ? (
        <ActionDialog
          title={`Antrag von @${handle} ablehnen`}
          description="Der Creator sieht deine Begründung im Studio und kann sich danach erneut bewerben."
          confirmLabel="Ablehnen"
          tone="danger"
          note={{
            label: "Begründung für den Creator",
            placeholder: "z. B. Die Bilder im Profil stammen aus einer Bilddatenbank – bitte bewirb dich mit eigenen Fotos.",
            hint: "Konkret und freundlich: Was soll beim nächsten Antrag anders sein?",
            required: true,
          }}
          onConfirm={(note) => rejectCreatorAction(userId, note)}
          onDone={() => {
            setDecided("rejected");
            toast({ tone: "success", title: `Antrag von @${handle} abgelehnt`, description: "Die Begründung ist gespeichert." });
          }}
          onClose={() => setRejecting(false)}
        />
      ) : null}
    </>
  );
}

"use client";

import { Ban, UserCheck } from "lucide-react";
import { useState } from "react";

import { banUserAction, unbanUserAction } from "@/app/admin/users/actions";
import { Button } from "@/components/ui/button";

import { ActionDialog } from "../action-dialog";
import { toast } from "../toast";

export type UserRowActionsProps = { userId: string; label: string; banned: boolean };

/** Sperren (Grund Pflicht) bzw. Entsperren mit Bestätigung. Fehler des Services erscheinen im Dialog. */
export function UserRowActions({ userId, label, banned }: UserRowActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {banned ? (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <UserCheck aria-hidden />
          Entsperren
          <span className="sr-only"> – {label}</span>
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="hover:text-danger">
          <Ban aria-hidden />
          Sperren
          <span className="sr-only"> – {label}</span>
        </Button>
      )}

      {open && banned ? (
        <ActionDialog
          title={`Sperre von ${label} aufheben?`}
          description="Das Konto kann sich wieder anmelden, abonnieren und melden. Bei der Sperre gekündigte Abos bleiben gekündigt."
          confirmLabel="Entsperren"
          onConfirm={() => unbanUserAction(userId)}
          onDone={() => toast({ tone: "success", title: `${label} ist entsperrt` })}
          onClose={() => setOpen(false)}
        />
      ) : null}

      {open && !banned ? (
        <ActionDialog
          title={`${label} sperren`}
          description="Gesperrte Konten können sich nicht mehr anmelden. Laufende Abos – als Fan und als Creator – enden zum Periodenende, und das Profil eines gesperrten Creators verschwindet für alle ausser Admins."
          confirmLabel="Sperren"
          tone="danger"
          note={{
            label: "Grund der Sperre",
            field: "reason",
            placeholder: "z. B. Spam-Nachrichten an mehrere Creator",
            hint: "Wird im Audit-Log gespeichert und der Person beim Anmelden angezeigt.",
            required: true,
            maxLength: 500,
          }}
          onConfirm={(reason) => banUserAction(userId, reason)}
          onDone={() => toast({ tone: "success", title: `${label} ist gesperrt`, description: "Laufende Abos enden zum Periodenende." })}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

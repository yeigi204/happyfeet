"use client";

import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CreatorPlan } from "@/lib/domain/types";
import { formatChf, formatNumber } from "@/lib/format";

import { EarningsPreview } from "./earnings-preview";
import { parseChfInput } from "./price";
import { PROFILE_FORM_IDLE, type ProfileField, type ProfileFormState } from "./profile-form-state";

export type CreatorProfileFormProps = {
  action: (state: ProfileFormState, formData: FormData) => Promise<ProfileFormState>;
  defaults: { bio: string; price: string };
  rules: {
    minPriceRappen: number;
    maxPriceRappen: number;
    bioMaxLength: number;
    standardFeeBps: number;
    premiumFeeBps: number;
  };
  plan: CreatorPlan;
  submitLabel: string;
  pendingLabel: string;
  /** Zusatz unter dem Preisfeld (z. B. „gilt nur für neue Abonnenten“). */
  priceNote?: string;
  /** Bewerbung: Pfeil im Button, volle Breite auf dem Handy. */
  variant?: "apply" | "update";
};

/**
 * Bio + Monatspreis mit Live-Rechnung. Kontrollierte Felder: nach einem Fehler bleibt alles stehen,
 * Feldfehler verschwinden, sobald man das Feld bearbeitet.
 */
export function CreatorProfileForm({ action, defaults, rules, plan, submitLabel, pendingLabel, priceNote, variant = "update" }: CreatorProfileFormProps) {
  const [state, formAction, pending] = useActionState(action, PROFILE_FORM_IDLE);
  const [bio, setBio] = useState(defaults.bio);
  const [price, setPrice] = useState(defaults.price);
  const [edited, setEdited] = useState<{ after: ProfileFormState; fields: ProfileField[] }>({ after: state, fields: [] });

  const editedFields = edited.after === state ? edited.fields : [];
  const markEdited = (field: ProfileField) =>
    setEdited((prev) => ({ after: state, fields: [...(prev.after === state ? prev.fields : []), field] }));
  const errorFor = (field: ProfileField) => (state.status === "error" && !editedFields.includes(field) ? state.fieldErrors[field] : undefined);

  const priceRappen = parseChfInput(price);
  const outOfRange = priceRappen !== null && (priceRappen < rules.minPriceRappen || priceRappen > rules.maxPriceRappen);
  const saved = state.status === "saved" && state.values.bio === bio && state.values.price === price;
  const formError = state.status === "error" && Object.keys(state.fieldErrors).length === 0 ? state.error : null;
  const bioNearLimit = bio.length > rules.bioMaxLength * 0.9;

  return (
    <form action={formAction} noValidate className="grid gap-6">
      <Field
        label="Bio"
        error={errorFor("bio")}
        hint={
          <span className="flex justify-between gap-3">
            <span>Erscheint auf deinem Profil. Was zeigst du, und wie oft gibt es Neues?</span>
            <span className={cn("shrink-0 font-mono tabular-nums", bioNearLimit && "text-warning")}>
              {formatNumber(bio.length)} / {formatNumber(rules.bioMaxLength)}
            </span>
          </span>
        }
      >
        <Textarea
          name="bio"
          rows={5}
          maxLength={rules.bioMaxLength}
          value={bio}
          onChange={(e) => {
            setBio(e.target.value);
            markEdited("bio");
          }}
          placeholder="z. B. Gepflegte Füsse aus Luzern, oft am See. Jeden Freitag neue Bilder, im Winter auch mal in Wollsocken."
          disabled={pending}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] sm:items-start">
        <Field
          label="Monatspreis in CHF"
          error={errorFor("price")}
          hint={`Zwischen ${formatChf(rules.minPriceRappen)} und ${formatChf(rules.maxPriceRappen)}, in 10-Rappen-Schritten.${priceNote ? ` ${priceNote}` : ""}`}
        >
          <Input
            name="price"
            inputMode="decimal"
            autoComplete="off"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              markEdited("price");
            }}
            placeholder="9.90"
            className="font-mono text-base tabular-nums"
            disabled={pending}
          />
        </Field>
        <EarningsPreview
          priceRappen={priceRappen}
          standardFeeBps={rules.standardFeeBps}
          premiumFeeBps={rules.premiumFeeBps}
          plan={plan}
          outOfRange={outOfRange}
        />
      </div>

      {formError ? (
        <p role="alert" className="rounded-control border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-ink">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line pt-5">
        <Button type="submit" variant="primary" size={variant === "apply" ? "lg" : "md"} disabled={pending} aria-busy={pending || undefined} className={variant === "apply" ? "w-full sm:w-auto" : undefined}>
          {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
          {pending ? pendingLabel : submitLabel}
          {!pending && variant === "apply" ? <ArrowRight aria-hidden /> : null}
        </Button>
        <p role="status" aria-live="polite" className="text-sm text-ink-muted">
          {saved ? (
            <span className="inline-flex items-center gap-1.5 text-success">
              <Check aria-hidden className="size-4" />
              Gespeichert
            </span>
          ) : null}
        </p>
      </div>
    </form>
  );
}

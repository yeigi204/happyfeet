"use client";

import { CircleCheck, LoaderCircle, OctagonAlert } from "lucide-react";
import { useActionState, useEffect, useState, type ChangeEvent, type ComponentProps, type ReactNode } from "react";

import { saveSettingsAction, type SettingsField, type SettingsFormState } from "@/app/admin/settings/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { feeBpsForPlan, splitPayment } from "@/lib/domain/fees";
import { formatChf, formatDateTime, formatNumber, formatPercentBps } from "@/lib/format";

import { hundredthsToInput, parseHundredths, parseWholeNumber } from "../lib/decimal-input";
import { toast } from "../toast";

export type SettingsValues = Record<SettingsField, number>;

type Inputs = Record<SettingsField, string>;

const INITIAL_STATE: SettingsFormState = { status: "idle" };

/** Grenzen wie in `src/server/services/admin/settings.ts` (`premiumPriceRappen`: 100–100’000 Rappen). */
const PREMIUM_PRICE_HINT = `${formatChf(100)} bis ${formatChf(100_000)}`;

function toInputs(v: SettingsValues): Inputs {
  return {
    standardFeeBps: hundredthsToInput(v.standardFeeBps, "percent"),
    premiumFeeBps: hundredthsToInput(v.premiumFeeBps, "percent"),
    premiumPriceRappen: hundredthsToInput(v.premiumPriceRappen, "chf"),
    minPriceRappen: hundredthsToInput(v.minPriceRappen, "chf"),
    maxPriceRappen: hundredthsToInput(v.maxPriceRappen, "chf"),
    premoderationCount: String(v.premoderationCount),
  };
}

/** Eingaben → Zahlen (nur wenn alle gültig) für die Live-Rechnung. */
function toValues(inputs: Inputs): SettingsValues | null {
  const out: Partial<SettingsValues> = {};
  for (const key of ["standardFeeBps", "premiumFeeBps", "premiumPriceRappen", "minPriceRappen", "maxPriceRappen"] as const) {
    const parsed = parseHundredths(inputs[key]);
    if (!parsed.ok) return null;
    out[key] = parsed.hundredths;
  }
  const count = parseWholeNumber(inputs.premoderationCount);
  if (!count.ok) return null;
  out.premoderationCount = count.value;
  return out as SettingsValues;
}

/** Input mit Einheit („CHF“ davor, „%“ dahinter). Nimmt `id`/`aria-*` von `Field` entgegen und reicht sie ans Input. */
function AdornedInput({ prefix, suffix, className, ...props }: ComponentProps<typeof Input> & { prefix?: string; suffix?: string }) {
  return (
    <div className="relative">
      {prefix ? (
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-xs text-ink-faint">
          {prefix}
        </span>
      ) : null}
      <Input {...props} className={cn("font-mono", prefix && "pl-12", suffix && "pr-9", className)} />
      {suffix ? (
        <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-xs text-ink-faint">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

/** Gleicher Zahlenwert? (Eingabe „15.0“ = gespeichert „15“.) */
function sameValue(key: SettingsField, a: string, b: string): boolean {
  if (key === "premoderationCount") {
    const x = parseWholeNumber(a);
    const y = parseWholeNumber(b);
    return x.ok && y.ok && x.value === y.value;
  }
  const x = parseHundredths(a);
  const y = parseHundredths(b);
  return x.ok && y.ok && x.hundredths === y.hundredths;
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-5 border-t border-line pt-6 first:border-t-0 first:pt-0 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
      <div>
        <legend className="text-[14px] font-semibold text-ink">{title}</legend>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{description}</p>
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2 [&>*]:content-start">{children}</div>
    </fieldset>
  );
}

export type SettingsFormProps = { initial: SettingsValues; updatedAt: Date };

/**
 * Plattform-Einstellungen. Eingabe in Prozent und Franken (wie man darüber spricht),
 * gespeichert als bps und Rappen. Rechts rechnet ein Beispiel live mit.
 */
export function SettingsForm({ initial, updatedAt }: SettingsFormProps) {
  const [state, formAction, pending] = useActionState(saveSettingsAction, INITIAL_STATE);
  const [inputs, setInputs] = useState<Inputs>(() => toInputs(initial));
  const [examplePrice, setExamplePrice] = useState("9.90");
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  // Nach dem Speichern rendert der Server neu → `initial` ist der gespeicherte Stand.
  const savedInputs = toInputs(initial);
  const dirty = (Object.keys(inputs) as SettingsField[]).some((k) => !sameValue(k, inputs[k], savedInputs[k]));

  useEffect(() => {
    if (state.status !== "saved") return;
    toast({ tone: "success", title: "Einstellungen gespeichert", description: "Neue Sätze gelten ab der nächsten Zahlung." });
  }, [state]);

  const field = (key: SettingsField) => ({
    name: key,
    value: inputs[key],
    onChange: (e: ChangeEvent<HTMLInputElement>) => setInputs((prev) => ({ ...prev, [key]: e.target.value })),
    autoComplete: "off",
    spellCheck: false,
  });

  return (
    <form
      action={formAction}
      noValidate
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start"
    >
      <Card className="min-w-0">
        <div className="grid gap-6 p-1 sm:p-2">
          <Section title="Provision" description="Anteil der Plattform an jeder Fan-Zahlung. Bereits verbuchte Zahlungen behalten ihren Satz.">
            <Field label="Standard-Creator" hint="0–50 %, z. B. 15 oder 12.5" error={errors.standardFeeBps?.[0]}>
              <AdornedInput {...field("standardFeeBps")} suffix="%" inputMode="decimal" />
            </Field>
            <Field label="Premium-Creator" hint="Der tiefere Satz ist der Hauptgrund für Premium." error={errors.premiumFeeBps?.[0]}>
              <AdornedInput {...field("premiumFeeBps")} suffix="%" inputMode="decimal" />
            </Field>
          </Section>

          <Section title="Premium-Plan" description="Was Creator monatlich für Premium zahlen – Badge, Such-Boost, Statistik, wöchentliche Auszahlung.">
            <Field label="Preis pro Monat" hint={PREMIUM_PRICE_HINT} error={errors.premiumPriceRappen?.[0]}>
              <AdornedInput {...field("premiumPriceRappen")} prefix="CHF" inputMode="decimal" />
            </Field>
          </Section>

          <Section title="Preisrahmen" description="Innerhalb dieser Grenzen setzen Creator ihren Abo-Preis. Laufende Abos behalten ihren Preis.">
            <Field label="Mindestpreis" hint="In 10-Rappen-Schritten" error={errors.minPriceRappen?.[0]}>
              <AdornedInput {...field("minPriceRappen")} prefix="CHF" inputMode="decimal" />
            </Field>
            <Field label="Höchstpreis" hint="In 10-Rappen-Schritten" error={errors.maxPriceRappen?.[0]}>
              <AdornedInput {...field("maxPriceRappen")} prefix="CHF" inputMode="decimal" />
            </Field>
          </Section>

          <Section title="Vorab-Prüfung" description="So viele Posts neuer Creator prüfst du, bevor Fans sie sehen. 0 schaltet die Prüfung ab.">
            <Field label="Anzahl Posts" hint="0 bis 50" error={errors.premoderationCount?.[0]}>
              <AdornedInput {...field("premoderationCount")} inputMode="numeric" />
            </Field>
          </Section>
        </div>

        <div className="-mx-4 -mb-4 mt-6 flex flex-wrap items-center gap-3 border-t border-line px-4 py-3.5">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
            Speichern
          </Button>
          <p aria-live="polite" className="text-[13px] text-ink-muted">
            {pending ? (
              "Speichert …"
            ) : state.status === "error" ? (
              <span className="flex items-center gap-1.5 text-danger">
                <OctagonAlert aria-hidden className="size-4" />
                {state.message}
              </span>
            ) : dirty ? (
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-1.5 rounded-full bg-warning" />
                Ungespeicherte Änderungen
              </span>
            ) : state.status === "saved" ? (
              <span className="flex items-center gap-1.5">
                <CircleCheck aria-hidden className="size-4 text-success" />
                Gespeichert
              </span>
            ) : (
              `Zuletzt geändert ${formatDateTime(updatedAt)}`
            )}
          </p>
        </div>
      </Card>

      <ExampleCalculation values={toValues(inputs)} examplePrice={examplePrice} onExamplePriceChange={setExamplePrice} />
    </form>
  );
}

function SplitBar({ label, net, fee, gross }: { label: string; net: number; fee: number; gross: number }) {
  const netShare = gross > 0 ? net / gross : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-medium text-ink">{label}</span>
        <span className="font-mono text-ink tabular-nums">{formatChf(net)}</span>
      </div>
      <div aria-hidden className="mt-2 flex h-2.5 gap-0.5">
        <span className="rounded-[3px] bg-series-2" style={{ flexGrow: netShare, flexBasis: 0 }} />
        <span className="min-w-[3px] rounded-[3px] bg-series-1" style={{ flexGrow: 1 - netShare, flexBasis: 0 }} />
      </div>
      <p className="mt-1.5 font-mono text-[11px] text-ink-faint tabular-nums">Plattform {formatChf(fee)}</p>
    </div>
  );
}

/** Live-Rechnung mit `splitPayment`/`feeBpsForPlan` – exakt so, wie später gebucht wird. */
function ExampleCalculation({
  values,
  examplePrice,
  onExamplePriceChange,
}: {
  values: SettingsValues | null;
  examplePrice: string;
  onExamplePriceChange: (v: string) => void;
}) {
  const price = parseHundredths(examplePrice);
  let body: ReactNode;

  if (!price.ok || price.hundredths <= 0) {
    body = <p className="text-[13px] text-ink-muted">Gib einen Beispielpreis ein, z. B. 9.90.</p>;
  } else if (!values || values.standardFeeBps > 10_000 || values.premiumFeeBps > 10_000 || values.standardFeeBps < 0 || values.premiumFeeBps < 0) {
    body = <p className="text-[13px] text-ink-muted">Sobald alle Felder gültig sind, rechnet das Beispiel mit.</p>;
  } else {
    const gross = price.hundredths;
    const standard = splitPayment(gross, feeBpsForPlan("standard", values));
    const premium = splitPayment(gross, feeBpsForPlan("premium", values));
    const saving = premium.creatorNetRappen - standard.creatorNetRappen;
    const breakEven = saving > 0 ? Math.ceil(values.premiumPriceRappen / saving) : null;
    const outOfRange = gross < values.minPriceRappen || gross > values.maxPriceRappen;

    body = (
      <div className="grid gap-5">
        <p className="text-[15px] leading-relaxed text-ink">
          Bei <b className="font-mono font-medium">{formatChf(gross)}</b> erhält ein Standard-Creator{" "}
          <b className="font-mono font-medium">{formatChf(standard.creatorNetRappen)}</b>, Premium <b className="font-mono font-medium">{formatChf(premium.creatorNetRappen)}</b>.
        </p>
        <div className="grid gap-4">
          <SplitBar label={`Standard · ${formatPercentBps(values.standardFeeBps)}`} net={standard.creatorNetRappen} fee={standard.platformFeeRappen} gross={gross} />
          <SplitBar label={`Premium · ${formatPercentBps(values.premiumFeeBps)}`} net={premium.creatorNetRappen} fee={premium.platformFeeRappen} gross={gross} />
        </div>
        <p className="flex items-center gap-4 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[2px] bg-series-2" />
            Creator
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[2px] bg-series-1" />
            Plattform
          </span>
        </p>
        <div className="border-t border-line pt-4 text-[13px] leading-relaxed text-ink-muted">
          {breakEven !== null ? (
            <>
              Premium für {formatChf(values.premiumPriceRappen)} im Monat rechnet sich für einen Creator ab{" "}
              <b className="font-medium text-ink">{formatNumber(breakEven)} Abos</b> zu diesem Preis – pro Abo bleiben {formatChf(saving)} mehr.
            </>
          ) : (
            <>Mit diesen Sätzen spart Premium keine Provision – Creator buchen es dann nur für Badge, Such-Boost, Statistik und wöchentliche Auszahlung.</>
          )}
        </div>
        {outOfRange ? (
          <p className="flex items-start gap-2 text-xs text-warning">
            <OctagonAlert aria-hidden className="mt-px size-3.5 shrink-0" />
            <span className="text-ink-muted">
              Liegt ausserhalb des Preisrahmens ({formatChf(values.minPriceRappen)} – {formatChf(values.maxPriceRappen)}) – so ein Abo wäre gar nicht möglich.
            </span>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <Card title="Rechenbeispiel" action={<span className="font-mono text-xs text-ink-faint">live</span>} className="xl:sticky xl:top-[68px]">
      <div className="grid gap-5">
        <Field label="Abo-Preis pro Monat" hint="Nur zum Rechnen – wird nicht gespeichert.">
          <AdornedInput value={examplePrice} onChange={(e) => onExamplePriceChange(e.target.value)} prefix="CHF" inputMode="decimal" autoComplete="off" />
        </Field>
        {body}
      </div>
    </Card>
  );
}

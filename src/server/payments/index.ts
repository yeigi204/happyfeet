import "server-only";

import { NotFoundError } from "@/server/errors";

import { MockPaymentProvider } from "./mock";
import type { PaymentProvider } from "./types";

export { MockPaymentProvider } from "./mock";
export * from "./types";

/** Bekannte Provider. Später z. B. `ccbill`/`segpay` ergänzen. */
const FACTORIES: Readonly<Record<string, () => PaymentProvider>> = {
  mock: () => new MockPaymentProvider(),
};

const DEFAULT_PROVIDER = "mock";

let testOverride: PaymentProvider | null = null;
const instances = new Map<string, PaymentProvider>();

function isKnown(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(FACTORIES, name);
}

function instanceFor(name: string): PaymentProvider {
  let provider = instances.get(name);
  if (!provider) {
    provider = FACTORIES[name]();
    instances.set(name, provider);
  }
  return provider;
}

/** Aktiver Provider laut `PAYMENT_PROVIDER` (Standard `mock`). Unbekannter Wert → Konfigurationsfehler. */
function activeProviderName(): string {
  const name = process.env.PAYMENT_PROVIDER?.trim() || DEFAULT_PROVIDER;
  if (!isKnown(name)) {
    throw new Error(
      `PAYMENT_PROVIDER ${JSON.stringify(name)} ist unbekannt (verfügbar: ${Object.keys(FACTORIES).join(", ")}).`,
    );
  }
  return name;
}

/**
 * Ohne `name`: der konfigurierte Provider. Mit `name` (z. B. aus der Webhook-Route): nur der
 * aktive Provider ist erreichbar – unbekannte oder nicht aktive Namen werfen `NotFoundError` (→ 404).
 */
export function getPaymentProvider(name?: string): PaymentProvider {
  if (testOverride && (name === undefined || name === testOverride.name)) return testOverride;
  if (name === undefined) return instanceFor(activeProviderName());

  if (!isKnown(name)) throw new NotFoundError("Unbekannter Zahlungsanbieter.");
  const active = process.env.PAYMENT_PROVIDER?.trim() || DEFAULT_PROVIDER;
  if (name !== active) throw new NotFoundError("Unbekannter Zahlungsanbieter.");
  return instanceFor(name);
}

/**
 * Mock-Provider für die simulierte Checkout-Seite. Nur verfügbar, solange `mock` der aktive
 * Provider ist – sonst `NotFoundError`, damit niemand Zahlungen simulieren kann.
 */
export function getMockProvider(): MockPaymentProvider {
  if (testOverride instanceof MockPaymentProvider) return testOverride;
  const provider = getPaymentProvider(DEFAULT_PROVIDER);
  if (!(provider instanceof MockPaymentProvider)) throw new NotFoundError("Unbekannter Zahlungsanbieter.");
  return provider;
}

/** Nur für Tests: ersetzt den Provider (z. B. `new MockPaymentProvider({ now })`). `null` setzt zurück. */
export function setPaymentProviderForTesting(p: PaymentProvider | null): void {
  testOverride = p;
}

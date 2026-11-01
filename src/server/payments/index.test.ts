import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/server/errors";

import { getMockProvider, getPaymentProvider, setPaymentProviderForTesting } from "./index";
import { MockPaymentProvider } from "./mock";
import type { PaymentProvider } from "./types";

const fakeProvider: PaymentProvider = {
  name: "fake",
  createCheckout: async () => ({ provider: "fake", sessionId: "s", redirectUrl: "/x" }),
  cancelSubscription: async () => {},
  parseWebhook: async () => {
    throw new Error("nicht implementiert");
  },
};

let previousProvider: string | undefined;

beforeEach(() => {
  previousProvider = process.env.PAYMENT_PROVIDER;
  delete process.env.PAYMENT_PROVIDER;
});

afterEach(() => {
  setPaymentProviderForTesting(null);
  if (previousProvider === undefined) delete process.env.PAYMENT_PROVIDER;
  else process.env.PAYMENT_PROVIDER = previousProvider;
});

describe("getPaymentProvider", () => {
  it("liefert ohne Konfiguration den Mock-Provider", () => {
    const provider = getPaymentProvider();
    expect(provider).toBeInstanceOf(MockPaymentProvider);
    expect(provider.name).toBe("mock");
  });

  it("liefert mit PAYMENT_PROVIDER=mock den Mock-Provider (auch per Name)", () => {
    process.env.PAYMENT_PROVIDER = "mock";
    expect(getPaymentProvider()).toBeInstanceOf(MockPaymentProvider);
    expect(getPaymentProvider("mock")).toBeInstanceOf(MockPaymentProvider);
  });

  it("unbekannter Provider-Name → NotFoundError (Webhook-Route antwortet 404)", () => {
    expect(() => getPaymentProvider("ccbill")).toThrow(NotFoundError);
    expect(() => getPaymentProvider("__proto__")).toThrow(NotFoundError);
  });

  it("ein nicht aktiver Provider ist per Name nicht erreichbar", () => {
    process.env.PAYMENT_PROVIDER = "segpay";
    expect(() => getPaymentProvider("mock")).toThrow(NotFoundError);
  });

  it("unbekanntes PAYMENT_PROVIDER ist ein Konfigurationsfehler", () => {
    process.env.PAYMENT_PROVIDER = "segpay";
    expect(() => getPaymentProvider()).toThrow(/PAYMENT_PROVIDER/);
  });

  it("Test-Override ersetzt den Provider, null setzt zurück", () => {
    setPaymentProviderForTesting(fakeProvider);
    expect(getPaymentProvider()).toBe(fakeProvider);
    expect(getPaymentProvider("fake")).toBe(fakeProvider);

    setPaymentProviderForTesting(null);
    expect(getPaymentProvider()).toBeInstanceOf(MockPaymentProvider);
  });
});

describe("getMockProvider", () => {
  it("liefert den Mock-Provider, wenn Mock aktiv ist", () => {
    expect(getMockProvider()).toBeInstanceOf(MockPaymentProvider);
    expect(getMockProvider()).toBe(getPaymentProvider("mock"));
  });

  it("liefert einen per Test-Override gesetzten Mock-Provider (z. B. mit fester Uhr)", () => {
    const fixed = new MockPaymentProvider({ now: () => new Date("2027-01-01T00:00:00Z") });
    setPaymentProviderForTesting(fixed);

    expect(getMockProvider()).toBe(fixed);
    expect(getPaymentProvider()).toBe(fixed);
    expect(getPaymentProvider("mock")).toBe(fixed);
  });

  it("wirft NotFoundError, wenn ein anderer Provider aktiv ist (Mock-Checkout dann nicht erreichbar)", () => {
    process.env.PAYMENT_PROVIDER = "segpay";
    expect(() => getMockProvider()).toThrow(NotFoundError);
  });

  it("ist in Produktion ohne ausdrückliches Opt-in nicht erreichbar (keine Gratis-Abos per simulierter Zahlung)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_MOCK_PAYMENTS_IN_PRODUCTION", "");
    try {
      expect(() => getMockProvider()).toThrow(NotFoundError);
      vi.stubEnv("ALLOW_MOCK_PAYMENTS_IN_PRODUCTION", "true");
      expect(getMockProvider()).toBeInstanceOf(MockPaymentProvider);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

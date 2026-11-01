import { createHash, createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ValidationError } from "@/server/errors";

import { MockPaymentProvider } from "./mock";
import { InvalidWebhookError, type CheckoutRequest, type PaymentEvent } from "./types";

const SECRET = "test-payment-webhook-secret-0123456789abcdef";
const NOW = new Date("2026-11-01T10:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

function request(overrides: Partial<CheckoutRequest> = {}): CheckoutRequest {
  return {
    kind: "fan_subscription",
    referenceId: "9b2f0f0e-4c4a-4a77-9d43-1d2a3c4b5e6f",
    payerUserId: "0c7d7a3e-55b1-4b0e-8a57-0f2b3c4d5e6f",
    amountRappen: 990,
    currency: "CHF",
    description: "Abo bei @zehenspitze – 1 Monat",
    successUrl: "http://localhost:3000/c/zehenspitze?abo=ok",
    cancelUrl: "http://localhost:3000/c/zehenspitze",
    ...overrides,
  };
}

/** Provider mit fester Uhr, damit Sessions deterministisch ablaufen. */
function provider(now: Date = NOW): MockPaymentProvider {
  return new MockPaymentProvider({ now: () => now });
}

function webhookRequest(body: string, signature: string | null): { headers: Headers; body: string } {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature !== null) headers.set("x-mock-signature", signature);
  return { headers, body };
}

let previousSecret: string | undefined;

beforeEach(() => {
  previousSecret = process.env.PAYMENT_WEBHOOK_SECRET;
  process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.PAYMENT_WEBHOOK_SECRET;
  else process.env.PAYMENT_WEBHOOK_SECRET = previousSecret;
});

describe("MockPaymentProvider – Checkout-Sessions", () => {
  it("heisst \"mock\"", () => {
    expect(new MockPaymentProvider().name).toBe("mock");
  });

  it("createCheckout liefert eine Session mit Redirect auf die Mock-Checkout-Seite", async () => {
    const session = await provider().createCheckout(request());

    expect(session.provider).toBe("mock");
    expect(session.sessionId).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(session.redirectUrl).toBe(`/checkout/mock/${session.sessionId}`);
  });

  it("Session-Roundtrip: decodeSession liefert den Request und das Ablaufdatum (1 h)", async () => {
    const p = provider();
    const req = request({ kind: "premium_plan", amountRappen: 1900, description: "Premium – 1 Monat" });
    const { sessionId } = await p.createCheckout(req);

    const decoded = p.decodeSession(sessionId, new Date(NOW.getTime() + 30 * 60 * 1000));

    expect(decoded).toEqual({ ...req, expiresAt: new Date(NOW.getTime() + HOUR_MS) });
  });

  it("decodeSession nutzt ohne `now` die Uhr des Providers", async () => {
    const p = provider();
    const { sessionId } = await p.createCheckout(request());

    expect(p.decodeSession(sessionId)).not.toBeNull();
    expect(provider(new Date(NOW.getTime() + 2 * HOUR_MS)).decodeSession(sessionId)).toBeNull();
  });

  it("abgelaufene Session → null", async () => {
    const p = provider();
    const { sessionId } = await p.createCheckout(request());

    expect(p.decodeSession(sessionId, new Date(NOW.getTime() + HOUR_MS - 1))).not.toBeNull();
    expect(p.decodeSession(sessionId, new Date(NOW.getTime() + HOUR_MS))).toBeNull();
  });

  it("manipulierter Payload → null (Signatur passt nicht mehr)", async () => {
    const p = provider();
    const { sessionId } = await p.createCheckout(request());
    const [payload, sig] = sessionId.split(".");
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const forged = Buffer.from(JSON.stringify({ ...data, amountRappen: 10 }), "utf8").toString("base64url");

    expect(p.decodeSession(`${forged}.${sig}`, NOW)).toBeNull();
  });

  it("manipulierte Signatur → null", async () => {
    const p = provider();
    const { sessionId } = await p.createCheckout(request());
    const [payload, sig] = sessionId.split(".");
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);

    expect(p.decodeSession(`${payload}.${flipped}`, NOW)).toBeNull();
    expect(p.decodeSession(`${payload}.${sig.slice(0, -2)}`, NOW)).toBeNull();
  });

  it("mit anderem Secret signierte Session → null", async () => {
    const { sessionId } = await provider().createCheckout(request());
    process.env.PAYMENT_WEBHOOK_SECRET = "another-secret-another-secret-another-secret";

    expect(provider().decodeSession(sessionId, NOW)).toBeNull();
  });

  it("korrekt signierter, aber ungültiger Payload → null", () => {
    const payload = Buffer.from(JSON.stringify({ kind: "free_lunch", exp: NOW.getTime() + HOUR_MS }), "utf8").toString(
      "base64url",
    );
    const sig = createHmac("sha256", SECRET).update(`checkout-session\n${payload}`).digest("base64url");

    expect(provider().decodeSession(`${payload}.${sig}`, NOW)).toBeNull();
  });

  it("Signatur gilt nur für den Session-Zweck (Domänentrennung), korrekt gebaute Session wird akzeptiert", () => {
    const data = { ...request(), exp: NOW.getTime() + HOUR_MS };
    const payload = Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
    const sessionSig = createHmac("sha256", SECRET).update(`checkout-session\n${payload}`).digest("base64url");
    const plainSig = createHmac("sha256", SECRET).update(payload).digest("base64url");

    expect(provider().decodeSession(`${payload}.${sessionSig}`, NOW)).toEqual({
      ...request(),
      expiresAt: new Date(NOW.getTime() + HOUR_MS),
    });
    expect(provider().decodeSession(`${payload}.${plainSig}`, NOW)).toBeNull();
  });

  it.each(["", "abc", "a.b.c", ".", "%%%.%%%"])("Unsinn %j → null", (sessionId) => {
    expect(provider().decodeSession(sessionId, NOW)).toBeNull();
  });

  it("nicht-kanonische Schreibweise derselben Signatur-Bytes → null (genau eine gültige Session-ID → genau eine Zahlungs-ID)", async () => {
    const p = provider();
    const { sessionId } = await p.createCheckout(request());
    const [payload, sig] = sessionId.split(".");
    // 32 Byte HMAC = 43 base64url-Zeichen; die letzten 2 Bits des letzten Zeichens sind ungenutzt.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const alt = sig.slice(0, -1) + alphabet[alphabet.indexOf(sig.at(-1)!) ^ 1];
    expect(Buffer.from(alt, "base64url").equals(Buffer.from(sig, "base64url"))).toBe(true);

    expect(p.decodeSession(`${payload}.${alt}`, NOW)).toBeNull();
    expect(p.decodeSession(`${payload}.${sig}=`, NOW)).toBeNull();
    expect(() => p.completedEventFor(`${payload}.${alt}`, NOW)).toThrow(ValidationError);
  });

  it("createCheckout lehnt ungültige Beträge ab", async () => {
    const p = provider();
    await expect(p.createCheckout(request({ amountRappen: 0 }))).rejects.toBeInstanceOf(ValidationError);
    await expect(p.createCheckout(request({ amountRappen: 9.9 }))).rejects.toBeInstanceOf(ValidationError);
    await expect(p.createCheckout(request({ referenceId: "" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["protokoll-relativ", "//evil.example/abo"],
    ["Backslash-Trick", "/\\evil.example/abo"],
    ["Tab-Trick (Browser entfernt Tabs → //)", "/\t/evil.example/abo"],
    ["kein Pfad", "c/zehenspitze"],
  ])("createCheckout lehnt unsichere Redirect-URLs ab (%s)", async (_label, url) => {
    const p = provider();
    await expect(p.createCheckout(request({ successUrl: url }))).rejects.toBeInstanceOf(ValidationError);
    await expect(p.createCheckout(request({ cancelUrl: url }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("createCheckout akzeptiert relative App-Pfade und absolute http(s)-URLs als Redirect", async () => {
    const p = provider();
    const req = request({ successUrl: "/c/zehenspitze?abo=ok", cancelUrl: "https://happyfeet.ch/c/zehenspitze" });
    const { sessionId } = await p.createCheckout(req);

    expect(p.decodeSession(sessionId, NOW)).toMatchObject({
      successUrl: "/c/zehenspitze?abo=ok",
      cancelUrl: "https://happyfeet.ch/c/zehenspitze",
    });
  });

  it("createCheckout lehnt Anfragen ab, deren Session-ID zu lang für decodeSession würde", async () => {
    const p = provider();
    const huge = request({
      description: "€".repeat(500),
      successUrl: `/${"€".repeat(1999)}`,
      cancelUrl: `/${"€".repeat(1999)}`,
    });

    await expect(p.createCheckout(huge)).rejects.toBeInstanceOf(ValidationError);
  });

  it("ohne PAYMENT_WEBHOOK_SECRET wirft createCheckout einen Konfigurationsfehler", async () => {
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    await expect(provider().createCheckout(request())).rejects.toThrow(/PAYMENT_WEBHOOK_SECRET/);
  });

  it("ohne PAYMENT_WEBHOOK_SECRET wirft decodeSession (kein stilles null)", async () => {
    const { sessionId } = await provider().createCheckout(request());
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    expect(() => provider().decodeSession(sessionId, NOW)).toThrow(/PAYMENT_WEBHOOK_SECRET/);
  });

  it("zu kurzes PAYMENT_WEBHOOK_SECRET wird abgelehnt", async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = "kurz";
    await expect(provider().createCheckout(request())).rejects.toThrow(/PAYMENT_WEBHOOK_SECRET/);
  });

  it("liest PAYMENT_WEBHOOK_SECRET erst beim Aufruf (nicht beim Erzeugen)", async () => {
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    const p = provider();
    process.env.PAYMENT_WEBHOOK_SECRET = SECRET;

    await expect(p.createCheckout(request())).resolves.toMatchObject({ provider: "mock" });
  });
});

describe("MockPaymentProvider – Events", () => {
  it("completedEventFor baut ein checkout.completed-Event aus der Session", async () => {
    const p = provider();
    const req = request();
    const { sessionId } = await p.createCheckout(req);
    const at = new Date(NOW.getTime() + 5 * 60 * 1000);

    const event = p.completedEventFor(sessionId, at);

    expect(event).toMatchObject({
      type: "checkout.completed",
      provider: "mock",
      kind: "fan_subscription",
      referenceId: req.referenceId,
      payerUserId: req.payerUserId,
      providerSubscriptionRef: `mocksub_${req.referenceId}`,
      amountRappen: 990,
      currency: "CHF",
      occurredAt: at,
    });
    if (event.type !== "checkout.completed") throw new Error("falscher Event-Typ");
    // Formel laut Plan: "mockpay_" + sha256(sessionId).slice(0, 24)
    expect(event.providerPaymentId).toBe(`mockpay_${createHash("sha256").update(sessionId).digest("hex").slice(0, 24)}`);
    expect(event.eventId).toMatch(/^mockevt_[0-9a-f]{24}$/);
    expect(event.eventId.slice(8)).not.toBe(event.providerPaymentId.slice(8));
  });

  it("completedEventFor zweimal (Doppelklick) → gleiche providerPaymentId und eventId", async () => {
    const p = provider();
    const { sessionId } = await p.createCheckout(request());

    const first = p.completedEventFor(sessionId, NOW);
    const second = p.completedEventFor(sessionId, new Date(NOW.getTime() + 1000));

    if (first.type !== "checkout.completed" || second.type !== "checkout.completed") throw new Error("falscher Typ");
    expect(second.providerPaymentId).toBe(first.providerPaymentId);
    expect(second.eventId).toBe(first.eventId);
  });

  it("verschiedene Sessions → verschiedene providerPaymentId", async () => {
    const p = provider();
    const a = await p.createCheckout(request());
    const b = await p.createCheckout(request({ referenceId: "11111111-2222-4333-8444-555555555555" }));

    const ea = p.completedEventFor(a.sessionId, NOW);
    const eb = p.completedEventFor(b.sessionId, NOW);

    if (ea.type !== "checkout.completed" || eb.type !== "checkout.completed") throw new Error("falscher Typ");
    expect(ea.providerPaymentId).not.toBe(eb.providerPaymentId);
  });

  it("completedEventFor mit abgelaufener oder manipulierter Session wirft ValidationError", async () => {
    const p = provider();
    const { sessionId } = await p.createCheckout(request());

    expect(() => p.completedEventFor(sessionId, new Date(NOW.getTime() + 2 * HOUR_MS))).toThrow(ValidationError);
    expect(() => p.completedEventFor(`x${sessionId}`, NOW)).toThrow(ValidationError);
  });

  it("renewalEventFor ist pro Periode deterministisch und unterscheidet Perioden", () => {
    const p = provider();
    const ref = "mocksub_9b2f0f0e-4c4a-4a77-9d43-1d2a3c4b5e6f";

    const first = p.renewalEventFor(ref, 990, 1, NOW);
    const replay = p.renewalEventFor(ref, 990, 1, new Date(NOW.getTime() + 1000));
    const next = p.renewalEventFor(ref, 990, 2, NOW);

    expect(first).toMatchObject({
      type: "subscription.renewed",
      provider: "mock",
      kind: "fan_subscription",
      providerSubscriptionRef: ref,
      amountRappen: 990,
      currency: "CHF",
      occurredAt: NOW,
    });
    if (first.type !== "subscription.renewed" || replay.type !== "subscription.renewed" || next.type !== "subscription.renewed") {
      throw new Error("falscher Typ");
    }
    expect(first.providerPaymentId).toMatch(/^mockpay_[0-9a-f]{24}$/);
    expect(replay.providerPaymentId).toBe(first.providerPaymentId);
    expect(replay.eventId).toBe(first.eventId);
    expect(next.providerPaymentId).not.toBe(first.providerPaymentId);
    expect(next.eventId).not.toBe(first.eventId);
  });

  it("renewalEventFor kann ein Premium-Plan-Event erzeugen", () => {
    const event = provider().renewalEventFor("mocksub_creator-1", 1900, 3, NOW, "premium_plan");
    expect(event).toMatchObject({ type: "subscription.renewed", kind: "premium_plan", amountRappen: 1900 });
  });

  it("renewalEventFor nutzt ohne `now` die Uhr des Providers", () => {
    expect(provider().renewalEventFor("mocksub_x", 990, 1).occurredAt).toEqual(NOW);
  });

  it("renewalEventFor lehnt ungültige Beträge und Perioden ab", () => {
    const p = provider();
    expect(() => p.renewalEventFor("mocksub_x", 0, 1, NOW)).toThrow(RangeError);
    expect(() => p.renewalEventFor("mocksub_x", 990.5, 1, NOW)).toThrow(RangeError);
    expect(() => p.renewalEventFor("mocksub_x", 990, -1, NOW)).toThrow(RangeError);
    expect(() => p.renewalEventFor("mocksub_x", 990, 1.5, NOW)).toThrow(RangeError);
    expect(() => p.renewalEventFor("", 990, 1, NOW)).toThrow(RangeError);
  });

  it("cancelSubscription ist beim Mock ein No-op", async () => {
    await expect(provider().cancelSubscription("mocksub_x")).resolves.toBeUndefined();
  });
});

describe("MockPaymentProvider – Webhooks", () => {
  it("Roundtrip signWebhookBody → parseWebhook (Datum wird wieder zu Date)", async () => {
    const p = provider();
    const { sessionId } = await p.createCheckout(request());
    const event = p.completedEventFor(sessionId, NOW);
    const body = JSON.stringify(event);

    const parsed = await p.parseWebhook(webhookRequest(body, p.signWebhookBody(body)));

    expect(parsed).toEqual(event);
    expect(parsed.occurredAt).toBeInstanceOf(Date);
  });

  it("Roundtrip für subscription.renewed und subscription.canceled", async () => {
    const p = provider();
    const renewed = p.renewalEventFor("mocksub_abc", 990, 1, NOW);
    const canceled: PaymentEvent = {
      type: "subscription.canceled",
      provider: "mock",
      eventId: "mockevt_cancel_1",
      kind: "premium_plan",
      providerSubscriptionRef: "mocksub_abc",
      occurredAt: NOW,
    };

    for (const event of [renewed, canceled]) {
      const body = JSON.stringify(event);
      await expect(p.parseWebhook(webhookRequest(body, p.signWebhookBody(body)))).resolves.toEqual(event);
    }
  });

  it("Roundtrip klappt auch mit maximal langer referenceId (providerSubscriptionRef = mocksub_ + referenceId)", async () => {
    const p = provider();
    const { sessionId } = await p.createCheckout(request({ referenceId: "r".repeat(200) }));
    const event = p.completedEventFor(sessionId, NOW);
    const body = JSON.stringify(event);

    await expect(p.parseWebhook(webhookRequest(body, p.signWebhookBody(body)))).resolves.toEqual(event);
  });

  it("Webhook-Signatur passt nicht als Session-Signatur und umgekehrt (Domänentrennung)", async () => {
    const p = provider();
    const { sessionId } = await p.createCheckout(request());
    const [payload, sessionSig] = sessionId.split(".");
    const sessionSigHex = Buffer.from(sessionSig, "base64url").toString("hex");

    await expect(p.parseWebhook(webhookRequest(payload, sessionSigHex))).rejects.toBeInstanceOf(InvalidWebhookError);
    const webhookSig = Buffer.from(p.signWebhookBody(payload), "hex").toString("base64url");
    expect(p.decodeSession(`${payload}.${webhookSig}`, NOW)).toBeNull();
  });

  it("signWebhookBody ist HMAC-SHA256 (hex) über den Body", () => {
    const body = '{"hello":"welt"}';
    expect(provider().signWebhookBody(body)).toBe(createHmac("sha256", SECRET).update(body).digest("hex"));
  });

  it("falsche Signatur → wirft InvalidWebhookError", async () => {
    const p = provider();
    const body = JSON.stringify(p.renewalEventFor("mocksub_abc", 990, 1, NOW));
    const wrong = createHmac("sha256", "not-the-secret-not-the-secret-not-the-secret").update(body).digest("hex");

    await expect(p.parseWebhook(webhookRequest(body, wrong))).rejects.toBeInstanceOf(InvalidWebhookError);
  });

  it("fehlende oder kaputte Signatur → wirft InvalidWebhookError", async () => {
    const p = provider();
    const body = JSON.stringify(p.renewalEventFor("mocksub_abc", 990, 1, NOW));
    const valid = p.signWebhookBody(body);

    await expect(p.parseWebhook(webhookRequest(body, null))).rejects.toBeInstanceOf(InvalidWebhookError);
    await expect(p.parseWebhook(webhookRequest(body, "zz"))).rejects.toBeInstanceOf(InvalidWebhookError);
    await expect(p.parseWebhook(webhookRequest(body, valid.slice(0, 32)))).rejects.toBeInstanceOf(InvalidWebhookError);
    await expect(p.parseWebhook(webhookRequest(body, valid.toUpperCase()))).rejects.toBeInstanceOf(InvalidWebhookError);
  });

  it("nachträglich veränderter Body → wirft InvalidWebhookError", async () => {
    const p = provider();
    const body = JSON.stringify(p.renewalEventFor("mocksub_abc", 990, 1, NOW));
    const signature = p.signWebhookBody(body);

    await expect(p.parseWebhook(webhookRequest(body.replace("990", "10"), signature))).rejects.toBeInstanceOf(
      InvalidWebhookError,
    );
  });

  it("korrekt signiertes, aber ungültiges JSON → wirft InvalidWebhookError", async () => {
    const p = provider();
    const body = "{nicht json";
    await expect(p.parseWebhook(webhookRequest(body, p.signWebhookBody(body)))).rejects.toBeInstanceOf(
      InvalidWebhookError,
    );
  });

  it.each([
    ["unbekannter Typ", { type: "refund.created" }],
    ["fremder Provider", { provider: "ccbill" }],
    ["Betrag nicht ganzzahlig", { amountRappen: 9.9 }],
    ["Betrag negativ", { amountRappen: -990 }],
    ["falsche Währung", { currency: "EUR" }],
    ["Datum kein ISO-String", { occurredAt: "gestern" }],
    ["Pflichtfeld fehlt", { providerPaymentId: undefined }],
  ])("korrekt signiert, aber Payload ungültig (%s) → InvalidWebhookError", async (_label, patch) => {
    const p = provider();
    const event = { ...JSON.parse(JSON.stringify(p.renewalEventFor("mocksub_abc", 990, 1, NOW))), ...patch };
    const body = JSON.stringify(event);

    await expect(p.parseWebhook(webhookRequest(body, p.signWebhookBody(body)))).rejects.toBeInstanceOf(
      InvalidWebhookError,
    );
  });

  it("ohne PAYMENT_WEBHOOK_SECRET ist parseWebhook ein Konfigurationsfehler, kein 400", async () => {
    const p = provider();
    const body = JSON.stringify(p.renewalEventFor("mocksub_abc", 990, 1, NOW));
    const signature = p.signWebhookBody(body);
    delete process.env.PAYMENT_WEBHOOK_SECRET;

    const error = await p.parseWebhook(webhookRequest(body, signature)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(InvalidWebhookError);
    expect(String(error)).toMatch(/PAYMENT_WEBHOOK_SECRET/);
  });

  it("InvalidWebhookError antwortet mit Status 400", () => {
    expect(new InvalidWebhookError().status).toBe(400);
  });
});

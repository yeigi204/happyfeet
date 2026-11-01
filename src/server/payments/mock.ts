import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { ValidationError, zodFieldErrors } from "@/server/errors";

import {
  InvalidWebhookError,
  type CheckoutKind,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentEvent,
  type PaymentProvider,
} from "./types";

/**
 * Simulierter Zahlungsanbieter fürs Grundgerüst.
 *
 * - Checkout-Session = `base64url(JSON) + "." + base64url(HMAC-SHA256)`, zustandslos, 1 h gültig.
 *   Der Fan "bezahlt" auf `/checkout/mock/<sessionId>`; daraus entsteht via `completedEventFor`
 *   ein `checkout.completed`-Event mit deterministischer Zahlungs-ID (Doppelklick → dieselbe ID).
 * - Webhooks: Header `x-mock-signature` = hex(HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, body)).
 *
 * Das Secret wird bei jedem Aufruf frisch aus `process.env` gelesen.
 */

const PROVIDER_NAME = "mock";
const SESSION_TTL_MS = 60 * 60 * 1000;
const MIN_SECRET_LENGTH = 32;
const MAX_SESSION_ID_LENGTH = 8192;
const SIGNATURE_HEADER = "x-mock-signature";
/** Domänentrennung: Session-Signaturen lassen sich nicht als Webhook-Signaturen wiederverwenden. */
const SESSION_SIGNING_CONTEXT = "checkout-session\n";
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/;

const checkoutKindSchema = z.enum(["fan_subscription", "premium_plan"]);
const idSchema = z.string().min(1).max(200);
/** Provider-Refs/-IDs: Platz für Präfix + `idSchema` (z. B. `mocksub_` + referenceId). */
const providerIdSchema = z.string().min(1).max(256);
const amountSchema = z.number().int().positive();

/**
 * Redirect-Ziel nach dem Checkout: relativer App-Pfad (`/…`, nicht `//` oder `/\`) oder absolute
 * http(s)-URL. Keine Leer-/Steuerzeichen (Browser entfernen Tabs → `/\t/evil` würde zu `//evil`).
 */
function isSafeRedirectUrl(value: string): boolean {
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return false;
  if (value.startsWith("/")) return !value.startsWith("//") && !value.startsWith("/\\");
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

const redirectUrlSchema = z
  .string()
  .min(1)
  .max(2000)
  .refine(isSafeRedirectUrl, "Nur relative Pfade oder http(s)-URLs sind erlaubt.");

const checkoutRequestSchema = z.object({
  kind: checkoutKindSchema,
  referenceId: idSchema,
  payerUserId: idSchema,
  amountRappen: amountSchema,
  currency: z.literal("CHF"),
  description: z.string().max(500),
  successUrl: redirectUrlSchema,
  cancelUrl: redirectUrlSchema,
});

const sessionPayloadSchema = checkoutRequestSchema.extend({
  /** Ablauf als Unix-Millisekunden. */
  exp: z.number().int().positive(),
});

const isoDateSchema = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

const eventBase = {
  provider: z.literal(PROVIDER_NAME),
  eventId: providerIdSchema,
  kind: checkoutKindSchema,
  providerSubscriptionRef: providerIdSchema,
  occurredAt: isoDateSchema,
};

const paymentFields = {
  providerPaymentId: providerIdSchema,
  amountRappen: amountSchema,
  currency: z.literal("CHF"),
};

const webhookEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("checkout.completed"),
    ...eventBase,
    ...paymentFields,
    referenceId: idSchema,
    payerUserId: idSchema,
  }),
  z.object({ type: z.literal("subscription.renewed"), ...eventBase, ...paymentFields }),
  z.object({ type: z.literal("subscription.canceled"), ...eventBase }),
]);

function requireSecret(): string {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `PAYMENT_WEBHOOK_SECRET fehlt oder ist kürzer als ${MIN_SECRET_LENGTH} Zeichen (siehe .env.example).`,
    );
  }
  return secret;
}

function hmac(secret: string, data: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Timing-sicherer Vergleich; unterschiedliche Längen sind nie gleich. */
function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

function signSessionPayload(secret: string, payload: string): string {
  return hmac(secret, SESSION_SIGNING_CONTEXT + payload).toString("base64url");
}

function assertPositiveRappen(amountRappen: number): void {
  if (!Number.isSafeInteger(amountRappen) || amountRappen <= 0) {
    throw new RangeError(`Betrag muss eine positive ganze Zahl in Rappen sein (erhalten: ${amountRappen}).`);
  }
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = PROVIDER_NAME;
  private readonly clock: () => Date;

  /** `now` ersetzt die Uhr (Tests); Standard ist die Systemzeit. */
  constructor(opts: { now?: () => Date } = {}) {
    this.clock = opts.now ?? (() => new Date());
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const parsed = checkoutRequestSchema.safeParse(req);
    if (!parsed.success) {
      throw new ValidationError("Ungültige Checkout-Anfrage.", zodFieldErrors(parsed.error.issues));
    }
    const secret = requireSecret();
    const exp = this.clock().getTime() + SESSION_TTL_MS;
    const payload = Buffer.from(JSON.stringify({ ...parsed.data, exp }), "utf8").toString("base64url");
    const sessionId = `${payload}.${signSessionPayload(secret, payload)}`;
    // Sonst entstünde eine Session, die decodeSession (und der URL-Pfad) nicht mehr annimmt.
    if (sessionId.length > MAX_SESSION_ID_LENGTH) {
      throw new ValidationError("Die Checkout-Anfrage ist zu gross.");
    }
    return { provider: this.name, sessionId, redirectUrl: `/checkout/mock/${sessionId}` };
  }

  /** Liefert den signierten Checkout-Request – oder `null`, wenn die Session manipuliert, kaputt oder abgelaufen ist. */
  decodeSession(sessionId: string, now: Date = this.clock()): (CheckoutRequest & { expiresAt: Date }) | null {
    const secret = requireSecret();
    if (typeof sessionId !== "string" || sessionId.length > MAX_SESSION_ID_LENGTH) return null;

    const parts = sessionId.split(".");
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    if (!BASE64URL_PATTERN.test(payload) || !BASE64URL_PATTERN.test(signature)) return null;

    // Kanonischer String-Vergleich: es gibt genau eine gültige Schreibweise pro Session
    // (wichtig, weil die Zahlungs-ID aus der Session-ID abgeleitet wird).
    const expected = signSessionPayload(secret, payload);
    if (!safeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"))) return null;

    let data: unknown;
    try {
      data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    const parsed = sessionPayloadSchema.safeParse(data);
    if (!parsed.success) return null;

    const { exp, ...request } = parsed.data;
    if (now.getTime() >= exp) return null;
    return { ...request, expiresAt: new Date(exp) };
  }

  /**
   * `checkout.completed` für eine gültige Session. Zahlungs- und Event-ID sind aus der Session-ID
   * abgeleitet, damit ein Doppelklick genau eine Zahlung ergibt. Wirft `ValidationError` bei
   * ungültiger/abgelaufener Session.
   */
  completedEventFor(sessionId: string, now: Date = this.clock()): PaymentEvent {
    const session = this.decodeSession(sessionId, now);
    if (!session) {
      throw new ValidationError("Diese Testzahlung ist ungültig oder abgelaufen. Bitte starte den Checkout neu.");
    }
    return {
      type: "checkout.completed",
      provider: this.name,
      eventId: `mockevt_${sha256Hex(`checkout.completed\n${sessionId}`).slice(0, 24)}`,
      kind: session.kind,
      referenceId: session.referenceId,
      payerUserId: session.payerUserId,
      providerSubscriptionRef: `mocksub_${session.referenceId}`,
      providerPaymentId: `mockpay_${sha256Hex(sessionId).slice(0, 24)}`,
      amountRappen: session.amountRappen,
      currency: session.currency,
      occurredAt: now,
    };
  }

  /**
   * `subscription.renewed` für Periode `periodIndex` (1 = erste Verlängerung). Zahlungs- und Event-ID
   * hängen nur von Ref und Periode ab → eine wiederholte Verlängerung derselben Periode ist idempotent.
   * `kind` lässt sich aus der Ref nicht ableiten und ist daher optional angebbar (Standard: Fan-Abo).
   */
  renewalEventFor(
    providerSubscriptionRef: string,
    amountRappen: number,
    periodIndex: number,
    now: Date = this.clock(),
    kind: CheckoutKind = "fan_subscription",
  ): PaymentEvent {
    if (typeof providerSubscriptionRef !== "string" || providerSubscriptionRef.length === 0) {
      throw new RangeError("providerSubscriptionRef darf nicht leer sein.");
    }
    assertPositiveRappen(amountRappen);
    if (!Number.isSafeInteger(periodIndex) || periodIndex < 0) {
      throw new RangeError(`periodIndex muss eine ganze Zahl ≥ 0 sein (erhalten: ${periodIndex}).`);
    }
    const period = `${providerSubscriptionRef}\n${periodIndex}`;
    return {
      type: "subscription.renewed",
      provider: this.name,
      eventId: `mockevt_${sha256Hex(`subscription.renewed\n${period}`).slice(0, 24)}`,
      kind,
      providerSubscriptionRef,
      providerPaymentId: `mockpay_${sha256Hex(`renewal\n${period}`).slice(0, 24)}`,
      amountRappen,
      currency: "CHF",
      occurredAt: now,
    };
  }

  /** Beim Mock gibt es kein externes Abo, das gekündigt werden müsste. */
  async cancelSubscription(providerSubscriptionRef: string): Promise<void> {
    void providerSubscriptionRef;
  }

  /** Signatur für den Header `x-mock-signature` (hex HMAC-SHA256 über den rohen Body). */
  signWebhookBody(body: string): string {
    return hmac(requireSecret(), body).toString("hex");
  }

  async parseWebhook(req: { headers: Headers; body: string }): Promise<PaymentEvent> {
    const secret = requireSecret();
    const signature = req.headers.get(SIGNATURE_HEADER) ?? "";
    if (!HEX_SHA256_PATTERN.test(signature)) {
      throw new InvalidWebhookError("Webhook-Signatur fehlt oder ist ungültig.");
    }
    if (!safeEqual(Buffer.from(signature, "hex"), hmac(secret, req.body))) {
      throw new InvalidWebhookError("Webhook-Signatur stimmt nicht.");
    }

    let data: unknown;
    try {
      data = JSON.parse(req.body);
    } catch {
      throw new InvalidWebhookError("Webhook-Payload ist kein gültiges JSON.");
    }
    const parsed = webhookEventSchema.safeParse(data);
    if (!parsed.success) {
      throw new InvalidWebhookError("Webhook-Payload ist ungültig.");
    }
    const event: PaymentEvent = parsed.data;
    return event;
  }
}

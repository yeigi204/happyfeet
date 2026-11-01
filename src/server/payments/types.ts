import "server-only";

import { AppError } from "@/server/errors";

/**
 * Austauschbare Zahlungs-Schnittstelle. Im Grundgerüst gibt es nur den Mock-Provider;
 * später z. B. CCBill/Segpay (Stripe/PayPal erlauben solchen Content i. d. R. nicht).
 * Beträge immer als Integer in Rappen.
 */

export type CheckoutKind = "fan_subscription" | "premium_plan";

export interface CheckoutRequest {
  kind: CheckoutKind;
  /** fan_subscription: `subscriptions.id`; premium_plan: `users.id` des Creators. */
  referenceId: string;
  payerUserId: string;
  amountRappen: number;
  currency: "CHF";
  description: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  provider: string;
  sessionId: string;
  redirectUrl: string;
}

export type PaymentEvent =
  | {
      type: "checkout.completed";
      provider: string;
      eventId: string;
      kind: CheckoutKind;
      referenceId: string;
      payerUserId: string;
      providerSubscriptionRef: string;
      providerPaymentId: string;
      amountRappen: number;
      currency: "CHF";
      occurredAt: Date;
    }
  | {
      type: "subscription.renewed";
      provider: string;
      eventId: string;
      kind: CheckoutKind;
      providerSubscriptionRef: string;
      providerPaymentId: string;
      amountRappen: number;
      currency: "CHF";
      occurredAt: Date;
    }
  | {
      type: "subscription.canceled";
      provider: string;
      eventId: string;
      kind: CheckoutKind;
      providerSubscriptionRef: string;
      occurredAt: Date;
    };

export interface PaymentProvider {
  readonly name: string;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  cancelSubscription(providerSubscriptionRef: string): Promise<void>;
  /** Prüft die Signatur und validiert den Payload. Wirft `InvalidWebhookError`, wenn beides nicht passt. */
  parseWebhook(req: { headers: Headers; body: string }): Promise<PaymentEvent>;
}

/** Webhook mit fehlender/falscher Signatur oder ungültigem Payload → die Route antwortet mit 400. */
export class InvalidWebhookError extends AppError {
  constructor(message = "Ungültiger Webhook.") {
    super("invalid_webhook", 400, message);
  }
}

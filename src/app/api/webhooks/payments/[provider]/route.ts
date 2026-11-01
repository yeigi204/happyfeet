import { NotFoundError } from "@/server/errors";
import { getPaymentProvider, InvalidWebhookError, type PaymentProvider } from "@/server/payments";
import { handlePaymentEvent } from "@/server/services/payment-events";

/**
 * Zahlungs-Webhook: `POST /api/webhooks/payments/<provider>`.
 *
 * 404 unbekannter/nicht aktiver Provider · 413 Body > 64 KB · 400 Signatur oder Payload ungültig ·
 * 200 `{ ok: true, applied }` – auch für bekannte (idempotente) oder nicht anwendbare Events,
 * damit der Anbieter sie nicht endlos wiederholt. Unerwartete Fehler → 500 (Anbieter wiederholt).
 */

const MAX_BODY_BYTES = 64 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * Liest den rohen Body als UTF-8-Text (exakt wie `request.text()`), bricht aber ab, sobald mehr als
 * `maxBytes` ankommen – auch ohne bzw. mit falschem `Content-Length`. `null` = zu gross.
 */
async function readBodyCapped(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function POST(request: Request, ctx: { params: Promise<{ provider: string }> }): Promise<Response> {
  const { provider: providerName } = await ctx.params;

  let provider: PaymentProvider;
  try {
    provider = getPaymentProvider(providerName);
  } catch (error) {
    if (error instanceof NotFoundError) return json({ ok: false, error: "Unbekannter Zahlungsanbieter." }, 404);
    throw error;
  }

  const body = await readBodyCapped(request, MAX_BODY_BYTES);
  if (body === null) return json({ ok: false, error: "Payload zu gross." }, 413);

  let event: Awaited<ReturnType<PaymentProvider["parseWebhook"]>>;
  try {
    event = await provider.parseWebhook({ headers: request.headers, body });
  } catch (error) {
    if (error instanceof InvalidWebhookError) {
      console.warn(`[webhook:payments:${provider.name}] abgelehnt: ${error.message}`);
      return json({ ok: false, error: error.message }, 400);
    }
    throw error;
  }
  if (event.provider !== provider.name) {
    return json({ ok: false, error: "Anbieter passt nicht zum Event." }, 400);
  }

  try {
    const { applied } = await handlePaymentEvent(event);
    return json({ ok: true, applied }, 200);
  } catch (error) {
    console.error(`[webhook:payments:${provider.name}] Verarbeitung fehlgeschlagen`, error);
    return json({ ok: false, error: "Verarbeitung fehlgeschlagen." }, 500);
  }
}

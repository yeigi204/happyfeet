import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/webhooks/payments/[provider]/route";
import { payments, subscriptions } from "@/server/db/schema";
import { startSubscriptionCheckout } from "@/server/services/subscriptions";

import { setupTestDb } from "../helpers/db";
import { createCreator, createUser, viewerFor } from "../helpers/factories";
import { sessionIdFrom, setupMockPayments } from "../helpers/task8";

const t = setupTestDb();
const NOW = new Date("2026-11-04T10:00:00Z");
const mock = setupMockPayments(NOW);

afterEach(() => {
  vi.restoreAllMocks();
});

const ctx = (provider: string) => ({ params: Promise.resolve({ provider }) });

function webhookRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/webhooks/payments/mock", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

function signed(body: string): Request {
  return webhookRequest(body, { "x-mock-signature": mock.provider.signWebhookBody(body) });
}

async function completedEventBody(): Promise<string> {
  const fan = await viewerFor(t.db, (await createUser(t.db)).id, NOW);
  const { user } = await createCreator(t.db);
  const { redirectUrl } = await startSubscriptionCheckout(fan, { creatorId: user.id }, { now: NOW });
  return JSON.stringify(mock.provider.completedEventFor(sessionIdFrom(redirectUrl), NOW));
}

describe("POST /api/webhooks/payments/[provider]", () => {
  it("verarbeitet ein signiertes Event und antwortet bei Wiederholung mit applied: false", async () => {
    const body = await completedEventBody();

    const first = await POST(signed(body), ctx("mock"));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, applied: true });
    expect((await t.db.select().from(subscriptions))[0].status).toBe("active");

    const replay = await POST(signed(body), ctx("mock"));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ ok: true, applied: false });
    expect(await t.db.select().from(payments)).toHaveLength(1);
  });

  it("falsche oder fehlende Signatur → 400, nichts wird gebucht", async () => {
    const body = await completedEventBody();

    const forged = await POST(webhookRequest(body, { "x-mock-signature": "0".repeat(64) }), ctx("mock"));
    expect(forged.status).toBe(400);
    expect((await POST(webhookRequest(body), ctx("mock"))).status).toBe(400);
    expect(await t.db.select().from(payments)).toHaveLength(0);
  });

  it("signierter, aber ungültiger Payload → 400", async () => {
    expect((await POST(signed("{kein json"), ctx("mock"))).status).toBe(400);
    expect((await POST(signed(JSON.stringify({ type: "egal" })), ctx("mock"))).status).toBe(400);
  });

  it("unbekannter Provider → 404", async () => {
    const body = await completedEventBody();
    const res = await POST(signed(body), ctx("ccbill"));
    expect(res.status).toBe(404);
    expect(await t.db.select().from(payments)).toHaveLength(0);
  });

  it("Body über 64 KB → 413 (mit und ohne Content-Length)", async () => {
    const huge = "x".repeat(64 * 1024 + 1);
    const declared = await POST(
      webhookRequest(huge, { "content-length": String(huge.length), "x-mock-signature": "0".repeat(64) }),
      ctx("mock"),
    );
    expect(declared.status).toBe(413);

    const streamed = new Request("http://localhost/api/webhooks/payments/mock", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          for (let i = 0; i < 70; i++) controller.enqueue(new TextEncoder().encode("y".repeat(1024)));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);
    expect((await POST(streamed, ctx("mock"))).status).toBe(413);
  });

  it("Bodies bis 64 KB werden normal geprüft", async () => {
    const res = await POST(signed(" ".repeat(64 * 1024)), ctx("mock"));
    expect(res.status).toBe(400); // gültige Signatur, aber kein Event
  });
});

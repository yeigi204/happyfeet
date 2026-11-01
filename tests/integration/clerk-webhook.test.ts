import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { Webhook } from "svix";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/webhooks/clerk/route";
import { users } from "@/server/db/schema";

import { setupTestDb } from "../helpers/db";
import { createUser } from "../helpers/factories";

// setupTestDb ist kein React-Hook, sondern registriert Vitest-Hooks (Namenskonvention aus tests/helpers/db.ts).
const t = setupTestDb();

const SECRET = `whsec_${Buffer.from("happyfeet-test-signing-secret-32b").toString("base64")}`;

function signedRequest(payload: unknown, secret = SECRET): NextRequest {
  const body = JSON.stringify(payload);
  const id = `msg_${randomUUID()}`;
  const now = new Date();
  const signature = new Webhook(secret).sign(id, now, body);
  return new NextRequest("http://localhost/api/webhooks/clerk", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(Math.floor(now.getTime() / 1000)),
      "svix-signature": signature,
    },
    body,
  });
}

function userEvent(type: "user.created" | "user.updated", data: Record<string, unknown>) {
  return {
    type,
    object: "event",
    data: {
      object: "user",
      image_url: "https://img.clerk.com/avatar.png",
      primary_email_address_id: "idn_primary",
      email_addresses: [
        { id: "idn_other", email_address: "zweit@example.ch", verification: { status: "verified" } },
        { id: "idn_primary", email_address: "haupt@example.ch", verification: { status: "verified" } },
        { id: "idn_unverified", email_address: "boss@example.ch", verification: { status: "unverified" } },
      ],
      ...data,
    },
  };
}

beforeEach(() => {
  vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", SECRET);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/clerk", () => {
  it("antwortet bei ungültiger Signatur mit 400 und schreibt nichts", async () => {
    const forged = `whsec_${Buffer.from("someone-else-entirely-different!!").toString("base64")}`;
    const res = await POST(signedRequest(userEvent("user.created", { id: "user_forged" }), forged));
    expect(res.status).toBe(400);
    expect(await t.db.select().from(users)).toHaveLength(0);
  });

  it("antwortet ohne Svix-Header mit 400", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/webhooks/clerk", {
        method: "POST",
        body: JSON.stringify(userEvent("user.created", { id: "user_x" })),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("legt bei user.created den Nutzer mit primärer E-Mail an", async () => {
    const res = await POST(signedRequest(userEvent("user.created", { id: "user_new" })));
    expect(res.status).toBe(200);
    const [row] = await t.db.select().from(users).where(eq(users.clerkId, "user_new"));
    expect(row).toMatchObject({ clerkId: "user_new", email: "haupt@example.ch", onboardedAt: null });
  });

  it("aktualisiert bei user.updated die E-Mail, ohne Profil oder Rechte anzutasten", async () => {
    const existing = await createUser(t.db, { clerkId: "user_known", handle: "bestand", isAdmin: true });
    const res = await POST(
      signedRequest(
        userEvent("user.updated", {
          id: "user_known",
          primary_email_address_id: "idn_other",
        }),
      ),
    );
    expect(res.status).toBe(200);
    const [row] = await t.db.select().from(users).where(eq(users.id, existing.id));
    expect(row).toMatchObject({ email: "zweit@example.ch", handle: "bestand", isAdmin: true });
  });

  it("übernimmt keine unbestätigte primäre E-Mail (sie könnte z. B. bei admin:grant jemanden identifizieren)", async () => {
    const res = await POST(
      signedRequest(userEvent("user.created", { id: "user_sneaky", primary_email_address_id: "idn_unverified" })),
    );
    expect(res.status).toBe(200);
    const [row] = await t.db.select().from(users).where(eq(users.clerkId, "user_sneaky"));
    expect(row.email).toBeNull();
  });

  it("greift ohne primäre Adresse nicht auf irgendeine andere zurück", async () => {
    const res = await POST(signedRequest(userEvent("user.created", { id: "user_phone", primary_email_address_id: null })));
    expect(res.status).toBe(200);
    const [row] = await t.db.select().from(users).where(eq(users.clerkId, "user_phone"));
    expect(row.email).toBeNull();
  });

  it("behält beim Update die bekannte E-Mail, wenn die neue primäre Adresse unbestätigt ist", async () => {
    await createUser(t.db, { clerkId: "user_known", email: "bestand@example.ch" });
    await POST(signedRequest(userEvent("user.updated", { id: "user_known", primary_email_address_id: "idn_unverified" })));
    const [row] = await t.db.select().from(users).where(eq(users.clerkId, "user_known"));
    expect(row.email).toBe("bestand@example.ch");
  });

  it("anonymisiert bei user.deleted den Nutzer (Zeile bleibt als Nachweis, E-Mail weg)", async () => {
    await createUser(t.db, { clerkId: "user_gone", email: "gone@example.ch" });
    const res = await POST(
      signedRequest({ type: "user.deleted", object: "event", data: { object: "user", id: "user_gone", deleted: true } }),
    );
    expect(res.status).toBe(200);
    const rows = await t.db.select().from(users).where(eq(users.clerkId, "user_gone"));
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBeNull();
    expect(rows[0].deletedAt).not.toBeNull();
  });

  it("antwortet bei signiertem, aber ungültigem Nutzer-Payload mit 400", async () => {
    const res = await POST(signedRequest({ type: "user.created", object: "event", data: { object: "user" } }));
    expect(res.status).toBe(400);
    expect(await t.db.select().from(users)).toHaveLength(0);
  });

  it("ignoriert andere Event-Typen mit 200", async () => {
    const res = await POST(
      signedRequest({ type: "session.created", object: "event", data: { object: "session", id: "sess_1" } }),
    );
    expect(res.status).toBe(200);
  });
});

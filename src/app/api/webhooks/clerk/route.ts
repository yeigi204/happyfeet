import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { deleteUserByClerkId, upsertUserFromClerk } from "@/server/services/users";

/**
 * Clerk-Webhook (Svix-signiert, Secret `CLERK_WEBHOOK_SIGNING_SECRET`).
 * Synchronisiert `users`: `user.created|updated` → upsert, `user.deleted` → löschen.
 * Alle Operationen sind idempotent, Svix-Wiederholungen sind also unkritisch.
 */

const TEXT_HEADERS = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };

const clerkUserSchema = z.object({
  id: z.string().min(1),
  image_url: z.string().nullish(),
  primary_email_address_id: z.string().nullish(),
  email_addresses: z
    .array(
      z.object({
        id: z.string(),
        email_address: z.string(),
        verification: z.object({ status: z.string() }).nullish(),
      }),
    )
    .default([]),
});

const deletedUserSchema = z.object({ id: z.string().min(1) });

function text(body: string, status: number): Response {
  return new Response(body, { status, headers: TEXT_HEADERS });
}

/**
 * Nur die primäre und bestätigte Adresse. Eine unbestätigte E-Mail darf niemanden identifizieren
 * (z. B. `npm run admin:grant -- <email>`); `null` lässt eine bekannte E-Mail unverändert.
 */
function verifiedPrimaryEmail(user: z.infer<typeof clerkUserSchema>): string | null {
  const primary = user.email_addresses.find((e) => e.id === user.primary_email_address_id);
  return primary?.verification?.status === "verified" ? primary.email_address : null;
}

export async function POST(request: NextRequest): Promise<Response> {
  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    event = await verifyWebhook(request);
  } catch (error) {
    console.warn("[webhook:clerk] Signatur ungültig", error instanceof Error ? error.message : error);
    return text("Ungültige Signatur.", 400);
  }

  switch (event.type) {
    case "user.created":
    case "user.updated": {
      const parsed = clerkUserSchema.safeParse(event.data);
      if (!parsed.success) return text("Ungültiger Nutzer-Payload.", 400);
      await upsertUserFromClerk({
        clerkId: parsed.data.id,
        email: verifiedPrimaryEmail(parsed.data),
        imageUrl: parsed.data.image_url ?? null,
      });
      break;
    }
    case "user.deleted": {
      const parsed = deletedUserSchema.safeParse(event.data);
      if (!parsed.success) return text("Ungültiger Nutzer-Payload.", 400);
      await deleteUserByClerkId(parsed.data.id);
      break;
    }
    default:
      // Andere Events sind abonniert, aber (noch) nicht relevant.
      break;
  }

  return text("ok", 200);
}

/**
 * Vergibt Admin-Rechte an einen bestehenden Nutzer.
 *
 *   npm run admin:grant -- <email|handle>
 *
 * Beispiele: `npm run admin:grant -- mara@example.ch`, `npm run admin:grant -- @hf_mara`.
 * Der Nutzer muss sich vorher einmal angemeldet haben (Zeile in `users`). Beendet sich mit Code 1,
 * wenn niemand (oder mehr als ein Nutzer) passt oder der Nutzer gesperrt ist.
 */
import "dotenv/config";

import { eq, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { normalizeHandle } from "@/lib/domain/handles";
import * as schema from "@/server/db/schema";
import { auditLog, users } from "@/server/db/schema";

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main() {
  const input = process.argv.slice(2).find((arg) => arg !== "--")?.trim() ?? "";
  if (!input) fail("Bitte E-Mail oder Handle angeben: npm run admin:grant -- <email|handle>");
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL ist nicht gesetzt (siehe .env.example).");

  const isEmail = !input.startsWith("@") && input.includes("@");
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  try {
    const matches = await db
      .select({
        id: users.id,
        handle: users.handle,
        email: users.email,
        isAdmin: users.isAdmin,
        status: users.status,
      })
      .from(users)
      .where(
        isEmail
          ? sql`lower(${users.email}) = lower(${input})`
          : or(eq(users.handle, normalizeHandle(input)), sql`lower(${users.email}) = lower(${input})`),
      )
      .limit(5);

    if (matches.length === 0) {
      fail(
        `Kein Nutzer mit ${isEmail ? "der E-Mail" : "dem Handle"} „${input}“ gefunden. ` +
          "Hat sich die Person schon einmal angemeldet?",
      );
    }
    if (matches.length > 1) {
      const list = matches.map((m) => `@${m.handle ?? "–"} (${m.email ?? "ohne E-Mail"})`).join(", ");
      fail(`„${input}“ passt auf mehrere Nutzer: ${list}. Bitte den Handle verwenden.`);
    }

    const [user] = matches;
    const label = user.handle ? `@${user.handle}` : (user.email ?? user.id);
    if (user.status === "banned") fail(`${label} ist gesperrt – bitte zuerst entsperren.`);
    if (user.isAdmin) {
      console.log(`✓ ${label} ist bereits Admin.`);
      return;
    }

    await db.transaction(async (tx) => {
      await tx.update(users).set({ isAdmin: true, updatedAt: new Date() }).where(eq(users.id, user.id));
      // Rechte-Änderung nachvollziehbar machen (Akteur: System/CLI).
      await tx.insert(auditLog).values({
        actorId: null,
        action: "user.admin_granted",
        targetType: "user",
        targetId: user.id,
        metadata: { via: "cli" },
      });
    });
    console.log(`✓ ${label} ist jetzt Admin.`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("✗ Admin-Rechte konnten nicht vergeben werden:", error);
  process.exit(1);
});

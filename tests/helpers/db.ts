/**
 * Test-Datenbank: PGlite (In-Memory-Postgres) mit den echten Drizzle-Migrationen.
 *
 * Verwendung in einer Testdatei:
 *
 *   const t = setupTestDb();        // registriert beforeEach/afterEach
 *   it("…", async () => { const db = t.db; … });
 *
 * Jede Testdatei bekommt eine frische Instanz; zwischen Tests werden alle Tabellen geleert.
 */
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach } from "vitest";

import { setDbForTesting, type Db } from "@/server/db/client";
import * as schema from "@/server/db/schema";

export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Db;
  await migrate(drizzle(client, { schema }), { migrationsFolder: "./drizzle" });
  return { db, close: () => client.close() };
}

const TABLES = [
  "audit_log",
  "reports",
  "post_media",
  "posts",
  "payouts",
  "payments",
  "subscriptions",
  "premium_subscriptions",
  "creator_profiles",
  "users",
];

export async function truncateAll(db: Db): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`));
  // Einstellungen auf Standard zurücksetzen (Zeile bleibt bestehen)
  await db.execute(sql`DELETE FROM platform_settings`);
  await db.execute(sql`INSERT INTO platform_settings (id) VALUES (1)`);
}

export function setupTestDb(): { readonly db: Db } {
  let current: { db: Db; close: () => Promise<void> } | null = null;

  beforeAll(async () => {
    current = await createTestDb();
    setDbForTesting(current.db);
  });

  beforeEach(async () => {
    if (current) await truncateAll(current.db);
  });

  afterAll(async () => {
    setDbForTesting(null);
    await current?.close();
    current = null;
  });

  return {
    get db() {
      if (!current) throw new Error("setupTestDb: Datenbank noch nicht bereit (nur innerhalb von Tests verwenden).");
      return current.db;
    },
  };
}

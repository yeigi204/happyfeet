import "server-only";

import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type Schema = typeof schema;
/** Gemeinsamer Typ für postgres-js (Prod) und PGlite (Tests). */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type DbOrTx = Db | Tx;

type GlobalWithDb = typeof globalThis & { __happyfeetDb?: Db };
const globalForDb = globalThis as GlobalWithDb;

let testOverride: Db | null = null;

/**
 * Liefert die Datenbank-Instanz. Einzige Stelle, an der eine Verbindung aufgebaut wird.
 * In Dev wird die Instanz über Hot-Reloads hinweg wiederverwendet.
 */
export function getDb(): Db {
  if (testOverride) return testOverride;
  if (!globalForDb.__happyfeetDb) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL ist nicht gesetzt (siehe .env.example).");
    }
    // prepare:false – kompatibel mit dem Supabase-Pooler (Transaction-Mode).
    const client = postgres(url, { prepare: false, max: 10 });
    globalForDb.__happyfeetDb = drizzle(client, { schema }) as unknown as Db;
  }
  return globalForDb.__happyfeetDb;
}

/** Nur für Tests: ersetzt die DB-Instanz (z. B. durch PGlite). `null` setzt zurück. */
export function setDbForTesting(db: Db | null): void {
  testOverride = db;
}

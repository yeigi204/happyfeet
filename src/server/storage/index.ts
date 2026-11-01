import "server-only";

import { LocalMediaStorage } from "./local";
import { SupabaseMediaStorage } from "./supabase";
import { supportsBatchSigning, type MediaStorage } from "./types";

export type { MediaStorage } from "./types";

/** Gültigkeit signierter Medien-URLs. */
export const MEDIA_URL_TTL_SECONDS = 300;

type Driver = "supabase" | "local";

let testOverride: MediaStorage | null = null;
let cached: { driver: Driver; storage: MediaStorage } | null = null;

function readDriver(): Driver {
  const driver = process.env.STORAGE_DRIVER;
  if (driver !== "supabase" && driver !== "local") {
    throw new Error(`STORAGE_DRIVER muss "supabase" oder "local" sein (aktuell: ${JSON.stringify(driver ?? null)}).`);
  }
  if (driver === "local" && process.env.NODE_ENV === "production") {
    throw new Error('STORAGE_DRIVER="local" ist in Produktion nicht erlaubt – bitte "supabase" verwenden.');
  }
  return driver;
}

/** Liefert den konfigurierten Medienspeicher (`STORAGE_DRIVER`). */
export function getMediaStorage(): MediaStorage {
  if (testOverride) return testOverride;
  const driver = readDriver();
  if (cached?.driver !== driver) {
    cached = { driver, storage: driver === "local" ? new LocalMediaStorage() : SupabaseMediaStorage.fromEnv() };
  }
  return cached.storage;
}

/** Nur für Tests: ersetzt den Medienspeicher (z. B. durch `InMemoryMediaStorage`). `null` setzt zurück. */
export function setMediaStorageForTesting(s: MediaStorage | null): void {
  testOverride = s;
  cached = null;
}

/** Signiert einen Key mit der Standard-Gültigkeit. Zugriffsprüfung muss vorher passiert sein. */
export function signMediaUrl(key: string): Promise<string> {
  return getMediaStorage().signedUrl(key, MEDIA_URL_TTL_SECONDS);
}

/** Signiert mehrere Keys (Duplikate nur einmal); nutzt Batch-Signierung, wenn der Treiber sie kann. */
export async function signMediaUrls(keys: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(keys)];
  if (unique.length === 0) return new Map();
  const storage = getMediaStorage();
  if (supportsBatchSigning(storage)) return storage.signedUrls(unique, MEDIA_URL_TTL_SECONDS);
  const urls = await Promise.all(unique.map((key) => storage.signedUrl(key, MEDIA_URL_TTL_SECONDS)));
  return new Map(unique.map((key, i) => [key, urls[i]]));
}

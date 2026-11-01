import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { BatchSigningMediaStorage } from "./types";

/** Teil von `supabase.storage.from(bucket)`, den der Treiber nutzt (erlaubt schlanke Test-Doubles). */
export type SupabaseBucketApi = Pick<
  ReturnType<SupabaseClient["storage"]["from"]>,
  "upload" | "createSignedUrl" | "createSignedUrls" | "remove"
>;

const DEFAULT_BUCKET = "media";
/** Supabase löscht höchstens 1000 Objekte pro Aufruf. */
const REMOVE_CHUNK_SIZE = 1000;

function storageError(action: string, key: string, message: string): Error {
  return new Error(`Supabase-Storage: ${action} für ${key} fehlgeschlagen: ${message}`);
}

/** Produktiv-Treiber: privater Supabase-Bucket, Zugriff nur mit Service-Role-Key und signierten URLs. */
export class SupabaseMediaStorage implements BatchSigningMediaStorage {
  constructor(
    private readonly bucket: SupabaseBucketApi,
    readonly bucketName: string,
  ) {}

  static fromEnv(): SupabaseMediaStorage {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein (siehe .env.example).");
    }
    const bucketName = process.env.SUPABASE_MEDIA_BUCKET || DEFAULT_BUCKET;
    const client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return new SupabaseMediaStorage(client.storage.from(bucketName), bucketName);
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const { error } = await this.bucket.upload(key, data, { contentType, upsert: false });
    if (error) throw storageError("Upload", key, error.message);
  }

  async signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await this.bucket.createSignedUrl(key, expiresInSeconds);
    if (error) throw storageError("Signieren", key, error.message);
    return data.signedUrl;
  }

  async signedUrls(keys: string[], expiresInSeconds: number): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (keys.length === 0) return result;
    const { data, error } = await this.bucket.createSignedUrls(keys, expiresInSeconds);
    if (error) throw storageError("Signieren", `${keys.length} Keys`, error.message);
    for (const entry of data) {
      if (entry.path && entry.signedUrl) result.set(entry.path, entry.signedUrl);
    }
    const missing = keys.find((key) => !result.has(key));
    if (missing) {
      const entry = data.find((e) => e.path === missing);
      throw storageError("Signieren", missing, entry?.error ?? "keine URL erhalten");
    }
    return result;
  }

  async remove(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += REMOVE_CHUNK_SIZE) {
      const chunk = keys.slice(i, i + REMOVE_CHUNK_SIZE);
      const { error } = await this.bucket.remove(chunk);
      if (error) throw storageError("Löschen", `${chunk.length} Keys`, error.message);
    }
  }
}

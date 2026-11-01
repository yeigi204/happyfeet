import "server-only";

/**
 * Austauschbarer Speicher für private Medien. Keys sind relative Pfade
 * (siehe `isSafeMediaKey`); ausgeliefert wird nur über kurzlebige signierte URLs.
 */
export interface MediaStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
  remove(keys: string[]): Promise<void>;
}

/**
 * Optionale Erweiterung: Treiber, die viele URLs in einem Aufruf signieren können
 * (z. B. Supabase mit einem einzigen HTTP-Request). `signMediaUrls` nutzt das automatisch.
 */
export interface BatchSigningMediaStorage extends MediaStorage {
  signedUrls(keys: string[], expiresInSeconds: number): Promise<Map<string, string>>;
}

export function supportsBatchSigning(storage: MediaStorage): storage is BatchSigningMediaStorage {
  return typeof (storage as Partial<BatchSigningMediaStorage>).signedUrls === "function";
}

/** Ablaufzeitpunkt als Unix-Sekunden, gerechnet ab jetzt. */
export function expiryUnixSeconds(expiresInSeconds: number, nowMs: number = Date.now()): number {
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new RangeError(`Ungültige Gültigkeitsdauer: ${expiresInSeconds}`);
  }
  return Math.floor(nowMs / 1000) + expiresInSeconds;
}

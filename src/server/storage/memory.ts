import "server-only";

import { expiryUnixSeconds, type MediaStorage } from "./types";

/** Speicher für Tests: hält Objekte im Prozess, signierte URLs sind reine Marker. */
export class InMemoryMediaStorage implements MediaStorage {
  readonly objects = new Map<string, { data: Buffer; contentType: string }>();

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { data, contentType });
  }

  async signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    return `memory://${key}?exp=${expiryUnixSeconds(expiresInSeconds)}`;
  }

  async remove(keys: string[]): Promise<void> {
    for (const key of keys) this.objects.delete(key);
  }
}

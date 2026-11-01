import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getMediaStorage, setMediaStorageForTesting, signMediaUrl, signMediaUrls } from "./index";
import { LocalMediaStorage } from "./local";
import { InMemoryMediaStorage } from "./memory";
import { SupabaseMediaStorage } from "./supabase";
import type { BatchSigningMediaStorage, MediaStorage } from "./types";

beforeEach(() => {
  setMediaStorageForTesting(null);
});

afterEach(() => {
  setMediaStorageForTesting(null);
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("getMediaStorage", () => {
  it("liefert die Test-Instanz, solange eine gesetzt ist", () => {
    vi.stubEnv("STORAGE_DRIVER", "local");
    const memory = new InMemoryMediaStorage();

    setMediaStorageForTesting(memory);
    expect(getMediaStorage()).toBe(memory);

    setMediaStorageForTesting(null);
    expect(getMediaStorage()).toBeInstanceOf(LocalMediaStorage);
  });

  it("liefert für STORAGE_DRIVER=local den lokalen Treiber (wiederverwendet)", () => {
    vi.stubEnv("STORAGE_DRIVER", "local");
    const first = getMediaStorage();
    expect(first).toBeInstanceOf(LocalMediaStorage);
    expect(getMediaStorage()).toBe(first);
  });

  it("verweigert den lokalen Treiber in Produktion", () => {
    vi.stubEnv("STORAGE_DRIVER", "local");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getMediaStorage()).toThrow(/Produktion/);
  });

  it.each([undefined, "", "s3", "LOCAL"])("wirft bei STORAGE_DRIVER=%j", (driver) => {
    if (driver === undefined) vi.stubEnv("STORAGE_DRIVER", undefined);
    else vi.stubEnv("STORAGE_DRIVER", driver);
    expect(() => getMediaStorage()).toThrow(/STORAGE_DRIVER/);
  });

  it("verlangt für Supabase URL und Service-Role-Key", () => {
    vi.stubEnv("STORAGE_DRIVER", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => getMediaStorage()).toThrow(/NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("liefert für STORAGE_DRIVER=supabase den Supabase-Treiber (auch in Produktion)", () => {
    vi.stubEnv("STORAGE_DRIVER", "supabase");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("SUPABASE_MEDIA_BUCKET", "media");
    const storage = getMediaStorage();
    expect(storage).toBeInstanceOf(SupabaseMediaStorage);
    expect((storage as SupabaseMediaStorage).bucketName).toBe("media");
  });
});

describe("signMediaUrl / signMediaUrls", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z")); // 1793534400
  });

  it("signiert mit einer Gültigkeit von 300 Sekunden", async () => {
    setMediaStorageForTesting(new InMemoryMediaStorage());
    await expect(signMediaUrl("posts/p/0-a-preview.webp")).resolves.toBe(
      "memory://posts/p/0-a-preview.webp?exp=1793534700",
    );
  });

  it("liefert eine URL pro (eindeutigem) Key", async () => {
    const memory = new InMemoryMediaStorage();
    const spy = vi.spyOn(memory, "signedUrl");
    setMediaStorageForTesting(memory);

    const urls = await signMediaUrls(["a.webp", "b.webp", "a.webp"]);

    expect(urls).toEqual(
      new Map([
        ["a.webp", "memory://a.webp?exp=1793534700"],
        ["b.webp", "memory://b.webp?exp=1793534700"],
      ]),
    );
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("ruft den Speicher bei leerer Liste gar nicht auf", async () => {
    const memory = new InMemoryMediaStorage();
    const spy = vi.spyOn(memory, "signedUrl");
    setMediaStorageForTesting(memory);

    await expect(signMediaUrls([])).resolves.toEqual(new Map());
    expect(spy).not.toHaveBeenCalled();
  });

  it("nutzt Batch-Signierung, wenn der Treiber sie anbietet", async () => {
    const batch: BatchSigningMediaStorage = {
      put: async () => {},
      remove: async () => {},
      signedUrl: async () => {
        throw new Error("Einzelsignierung sollte nicht verwendet werden");
      },
      signedUrls: vi.fn(async (keys: string[], ttl: number) => new Map(keys.map((k) => [k, `batch://${k}?ttl=${ttl}`]))),
    };
    setMediaStorageForTesting(batch);

    const urls = await signMediaUrls(["x.webp", "y.webp", "x.webp"]);

    expect(urls).toEqual(
      new Map([
        ["x.webp", "batch://x.webp?ttl=300"],
        ["y.webp", "batch://y.webp?ttl=300"],
      ]),
    );
    expect(batch.signedUrls).toHaveBeenCalledWith(["x.webp", "y.webp"], 300);
  });

  it("gibt Fehler des Treibers weiter", async () => {
    const failing: MediaStorage = {
      put: async () => {},
      remove: async () => {},
      signedUrl: async () => {
        throw new Error("kaputt");
      },
    };
    setMediaStorageForTesting(failing);
    await expect(signMediaUrl("a.webp")).rejects.toThrow("kaputt");
    await expect(signMediaUrls(["a.webp"])).rejects.toThrow("kaputt");
  });
});

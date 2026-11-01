import { afterEach, describe, expect, it, vi } from "vitest";

import { SupabaseMediaStorage, type SupabaseBucketApi } from "./supabase";

/** Minimaler Ersatz für `supabase.storage.from(bucket)` – der echte Dienst ist in Tests nicht erreichbar. */
function fakeBucket(overrides: Partial<Record<keyof SupabaseBucketApi, unknown>> = {}) {
  const bucket = {
    upload: vi.fn(async () => ({ data: { id: "1", path: "p", fullPath: "media/p" }, error: null })),
    createSignedUrl: vi.fn(async (key: string, ttl: number) => ({
      data: { signedUrl: `https://cdn.example/${key}?ttl=${ttl}` },
      error: null,
    })),
    createSignedUrls: vi.fn(async (keys: string[], ttl: number) => ({
      data: keys.map((k) => ({ path: k, error: null, signedURL: null, signedUrl: `https://cdn.example/${k}?ttl=${ttl}` })),
      error: null,
    })),
    remove: vi.fn(async () => ({ data: [], error: null })),
    ...overrides,
  };
  return bucket as typeof bucket & SupabaseBucketApi;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SupabaseMediaStorage", () => {
  it("lädt mit Content-Type hoch und überschreibt nie bestehende Objekte", async () => {
    const bucket = fakeBucket();
    const data = Buffer.from("webp");
    await new SupabaseMediaStorage(bucket, "media").put("posts/a.webp", data, "image/webp");

    expect(bucket.upload).toHaveBeenCalledWith(
      "posts/a.webp",
      data,
      expect.objectContaining({ contentType: "image/webp", upsert: false }),
    );
  });

  it("wirft bei Upload-Fehlern", async () => {
    const bucket = fakeBucket({ upload: vi.fn(async () => ({ data: null, error: new Error("Bucket fehlt") })) });
    await expect(new SupabaseMediaStorage(bucket, "media").put("a.webp", Buffer.from(""), "image/webp")).rejects.toThrow(
      /a\.webp.*Bucket fehlt/,
    );
  });

  it("signiert einzeln und im Batch", async () => {
    const bucket = fakeBucket();
    const storage = new SupabaseMediaStorage(bucket, "media");

    await expect(storage.signedUrl("a.webp", 300)).resolves.toBe("https://cdn.example/a.webp?ttl=300");
    await expect(storage.signedUrls(["a.webp", "b.webp"], 300)).resolves.toEqual(
      new Map([
        ["a.webp", "https://cdn.example/a.webp?ttl=300"],
        ["b.webp", "https://cdn.example/b.webp?ttl=300"],
      ]),
    );
  });

  it("wirft, wenn eine Batch-Signatur fehlt", async () => {
    const bucket = fakeBucket({
      createSignedUrls: vi.fn(async () => ({
        data: [{ path: "a.webp", error: "Object not found", signedURL: null, signedUrl: null }],
        error: null,
      })),
    });
    await expect(new SupabaseMediaStorage(bucket, "media").signedUrls(["a.webp"], 300)).rejects.toThrow(/a\.webp/);
  });

  it("wirft bei Signierfehlern", async () => {
    const bucket = fakeBucket({ createSignedUrl: vi.fn(async () => ({ data: null, error: new Error("nope") })) });
    await expect(new SupabaseMediaStorage(bucket, "media").signedUrl("a.webp", 300)).rejects.toThrow(/nope/);
  });

  it("löscht Keys und überspringt leere Listen", async () => {
    const bucket = fakeBucket();
    const storage = new SupabaseMediaStorage(bucket, "media");

    await storage.remove([]);
    expect(bucket.remove).not.toHaveBeenCalled();

    await storage.remove(["a.webp", "b.webp"]);
    expect(bucket.remove).toHaveBeenCalledWith(["a.webp", "b.webp"]);
  });

  it("löscht in Blöcken von höchstens 1000 Keys (Supabase-Limit)", async () => {
    const chunks: string[][] = [];
    const bucket = fakeBucket({
      remove: vi.fn(async (paths: string[]) => {
        chunks.push([...paths]);
        return { data: [], error: null };
      }),
    });
    const keys = Array.from({ length: 2500 }, (_, i) => `posts/p/${i}.webp`);

    await new SupabaseMediaStorage(bucket, "media").remove(keys);

    expect(chunks.map((chunk) => chunk.length)).toEqual([1000, 1000, 500]);
    expect(chunks.flat()).toEqual(keys);
  });

  it("schickt für eine leere Batch-Liste keinen Request", async () => {
    const bucket = fakeBucket();
    await expect(new SupabaseMediaStorage(bucket, "media").signedUrls([], 300)).resolves.toEqual(new Map());
    expect(bucket.createSignedUrls).not.toHaveBeenCalled();
  });

  it("wirft bei Löschfehlern", async () => {
    const bucket = fakeBucket({ remove: vi.fn(async () => ({ data: null, error: new Error("weg") })) });
    await expect(new SupabaseMediaStorage(bucket, "media").remove(["a.webp"])).rejects.toThrow(/weg/);
  });

  it("verlangt die Supabase-Umgebungsvariablen", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => SupabaseMediaStorage.fromEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("nimmt standardmässig den Bucket media", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("SUPABASE_MEDIA_BUCKET", "");
    expect(SupabaseMediaStorage.fromEnv().bucketName).toBe("media");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InMemoryMediaStorage } from "./memory";
import type { MediaStorage } from "./types";

describe("InMemoryMediaStorage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("legt Objekte mit Inhalt und Content-Type ab", async () => {
    const storage: MediaStorage = new InMemoryMediaStorage();
    await storage.put("posts/p1/0-a-original.webp", Buffer.from("bild"), "image/webp");

    const mem = storage as InMemoryMediaStorage;
    expect(mem.objects.get("posts/p1/0-a-original.webp")).toEqual({
      data: Buffer.from("bild"),
      contentType: "image/webp",
    });
  });

  it("signiert als memory://<key>?exp=<unix> mit Ablauf in der Zukunft", async () => {
    const storage = new InMemoryMediaStorage();
    // 2026-11-01T12:00:00Z = 1793534400
    await expect(storage.signedUrl("posts/p1/0-a-preview.webp", 300)).resolves.toBe(
      "memory://posts/p1/0-a-preview.webp?exp=1793534700",
    );
  });

  it("signiert auch Keys ohne abgelegtes Objekt (Factories legen keine Dateien an)", async () => {
    const storage = new InMemoryMediaStorage();
    await expect(storage.signedUrl("posts/x/0-original.webp", 60)).resolves.toBe(
      "memory://posts/x/0-original.webp?exp=1793534460",
    );
  });

  it("entfernt die angegebenen Keys und ignoriert fehlende", async () => {
    const storage = new InMemoryMediaStorage();
    await storage.put("a.webp", Buffer.from("a"), "image/webp");
    await storage.put("b.webp", Buffer.from("b"), "image/webp");

    await storage.remove(["a.webp", "fehlt.webp"]);

    expect([...storage.objects.keys()]).toEqual(["b.webp"]);
  });
});

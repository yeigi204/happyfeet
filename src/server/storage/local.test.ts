import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalMediaStorage, readLocalMedia, verifyLocalMediaSignature } from "./local";

const SECRET = "test-secret-test-secret-test-secret-42";
const KEY = "posts/p1/0-abc-original.webp";
const NOW = new Date("2026-11-01T12:00:00Z"); // 1793534400

/** Unabhängig nachgerechnete Signatur gemäss Vertrag: hex(hmac-sha256(secret, key + "\n" + exp)). */
function expectedSig(key: string, exp: number | string, secret = SECRET): string {
  return createHmac("sha256", secret).update(`${key}\n${exp}`).digest("hex");
}

function parseSignedUrl(url: string): { pathname: string; exp: string; sig: string } {
  const u = new URL(url, "http://localhost");
  return { pathname: u.pathname, exp: u.searchParams.get("exp") ?? "", sig: u.searchParams.get("sig") ?? "" };
}

let root: string;
let workDir: string;

beforeEach(async () => {
  vi.stubEnv("MEDIA_SIGNING_SECRET", SECRET);
  workDir = await mkdtemp(path.join(tmpdir(), "happyfeet-local-"));
  root = path.join(workDir, "media");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
  await rm(workDir, { recursive: true, force: true });
});

describe("LocalMediaStorage – Dateien", () => {
  it("speichert unter <root>/<key> und liest mit Content-Type zurück", async () => {
    const storage = new LocalMediaStorage({ rootDir: root });
    await storage.put(KEY, Buffer.from("webp-bytes"), "image/webp");

    expect(await readFile(path.join(root, KEY), "utf8")).toBe("webp-bytes");
    await expect(readLocalMedia(KEY, root)).resolves.toEqual({
      data: Buffer.from("webp-bytes"),
      contentType: "image/webp",
    });
  });

  it("verwendet standardmässig .data/media im Arbeitsverzeichnis", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(workDir);
    const storage = new LocalMediaStorage();
    await storage.put(KEY, Buffer.from("x"), "image/webp");

    expect(await readFile(path.join(workDir, ".data", "media", KEY), "utf8")).toBe("x");
    await expect(readLocalMedia(KEY)).resolves.toMatchObject({ contentType: "image/webp" });
  });

  it("liefert null für fehlende Dateien", async () => {
    await expect(readLocalMedia("posts/fehlt.webp", root)).resolves.toBeNull();
  });

  it("liest nie ausserhalb des Medienordners (Path Traversal)", async () => {
    await writeFile(path.join(workDir, "secret.webp"), "geheim");
    await expect(readLocalMedia("../secret.webp", root)).resolves.toBeNull();
    await expect(readLocalMedia(path.join(workDir, "secret.webp"), root)).resolves.toBeNull();
  });

  it("verweigert das Schreiben unsicherer Keys", async () => {
    const storage = new LocalMediaStorage({ rootDir: root });
    await expect(storage.put("../ausbruch.webp", Buffer.from("x"), "image/webp")).rejects.toThrow();
    await expect(storage.put("/tmp/abs.webp", Buffer.from("x"), "image/webp")).rejects.toThrow();
  });

  it("verweigert Content-Types, die nicht zur Dateiendung passen", async () => {
    const storage = new LocalMediaStorage({ rootDir: root });
    await expect(storage.put("posts/a.webp", Buffer.from("x"), "text/html")).rejects.toThrow();
    await expect(storage.put("posts/a.html", Buffer.from("x"), "text/html")).rejects.toThrow();
  });

  it("leitet den Content-Type beim Lesen aus der Endung ab", async () => {
    const storage = new LocalMediaStorage({ rootDir: root });
    await storage.put("a.png", Buffer.from("p"), "image/png");
    await storage.put("b.jpg", Buffer.from("j"), "image/jpeg");

    await expect(readLocalMedia("a.png", root)).resolves.toMatchObject({ contentType: "image/png" });
    await expect(readLocalMedia("b.jpg", root)).resolves.toMatchObject({ contentType: "image/jpeg" });
  });

  it("entfernt Dateien und ignoriert fehlende", async () => {
    const storage = new LocalMediaStorage({ rootDir: root });
    await storage.put(KEY, Buffer.from("x"), "image/webp");

    await storage.remove([KEY, "posts/fehlt.webp"]);

    await expect(readLocalMedia(KEY, root)).resolves.toBeNull();
  });
});

describe("LocalMediaStorage – signierte URLs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it("signiert als /api/media/<key>?exp=<unix>&sig=<hmac>", async () => {
    const url = await new LocalMediaStorage({ rootDir: root }).signedUrl(KEY, 300);

    expect(url).toBe(`/api/media/${KEY}?exp=1793534700&sig=${expectedSig(KEY, 1793534700)}`);
  });

  it("verweigert das Signieren unsicherer Keys", async () => {
    await expect(new LocalMediaStorage({ rootDir: root }).signedUrl("../x.webp", 300)).rejects.toThrow();
  });

  it("wirft ohne bzw. mit zu kurzem MEDIA_SIGNING_SECRET", async () => {
    const storage = new LocalMediaStorage({ rootDir: root });
    vi.stubEnv("MEDIA_SIGNING_SECRET", "");
    await expect(storage.signedUrl(KEY, 300)).rejects.toThrow(/MEDIA_SIGNING_SECRET/);
    vi.stubEnv("MEDIA_SIGNING_SECRET", "zu-kurz");
    await expect(storage.signedUrl(KEY, 300)).rejects.toThrow(/MEDIA_SIGNING_SECRET/);
  });
});

describe("verifyLocalMediaSignature", () => {
  async function signed(key = KEY, ttl = 300) {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const url = await new LocalMediaStorage({ rootDir: root }).signedUrl(key, ttl);
    vi.useRealTimers();
    return parseSignedUrl(url);
  }

  it("akzeptiert eine gültige Signatur vor Ablauf", async () => {
    const { exp, sig } = await signed();
    expect(verifyLocalMediaSignature(KEY, exp, sig, NOW)).toBe(true);
    expect(verifyLocalMediaSignature(KEY, Number(exp), sig, new Date("2026-11-01T12:04:59Z"))).toBe(true);
  });

  it("prüft ohne now-Argument gegen die aktuelle Uhrzeit", async () => {
    const { exp, sig } = await signed();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T12:04:59Z"));
    expect(verifyLocalMediaSignature(KEY, exp, sig)).toBe(true);
    vi.setSystemTime(new Date("2026-11-01T12:05:00Z"));
    expect(verifyLocalMediaSignature(KEY, exp, sig)).toBe(false);
  });

  it("lehnt abgelaufene Signaturen ab", async () => {
    const { exp, sig } = await signed();
    expect(verifyLocalMediaSignature(KEY, exp, sig, new Date("2026-11-01T12:05:00Z"))).toBe(false);
    expect(verifyLocalMediaSignature(KEY, exp, sig, new Date("2026-11-02T00:00:00Z"))).toBe(false);
  });

  it("lehnt manipulierte Signaturen ab", async () => {
    const { exp, sig } = await signed();
    const flipped = (sig[0] === "a" ? "b" : "a") + sig.slice(1);
    expect(verifyLocalMediaSignature(KEY, exp, flipped, NOW)).toBe(false);
  });

  it("lehnt einen verlängerten Ablauf ab", async () => {
    const { exp, sig } = await signed();
    expect(verifyLocalMediaSignature(KEY, String(Number(exp) + 3600), sig, NOW)).toBe(false);
  });

  it("lehnt eine Signatur für einen fremden Key ab", async () => {
    const { exp, sig } = await signed("posts/p1/0-abc-preview.webp");
    expect(verifyLocalMediaSignature(KEY, exp, sig, NOW)).toBe(false);
  });

  it("lehnt Signaturen mit anderem Secret ab", () => {
    const exp = 1793534700;
    expect(verifyLocalMediaSignature(KEY, exp, expectedSig(KEY, exp, "anderes-secret-anderes-secret-0000"), NOW)).toBe(
      false,
    );
    expect(verifyLocalMediaSignature(KEY, exp, expectedSig(KEY, exp), NOW)).toBe(true);
  });

  it.each([
    ["leere Signatur", "1793534700", ""],
    ["zu kurze Signatur", "1793534700", "abcd"],
    ["Nicht-Hex", "1793534700", "z".repeat(64)],
    ["Grossbuchstaben-Hex", "1793534700", expectedSig(KEY, "1793534700").toUpperCase()],
    ["leerer Ablauf", "", expectedSig(KEY, "")],
    ["Ablauf mit Exponent", "2e9", expectedSig(KEY, "2e9")],
    ["negativer Ablauf", "-5", expectedSig(KEY, "-5")],
    ["Ablauf mit führender Null", "01793534700", expectedSig(KEY, "01793534700")],
    ["Ablauf als Dezimalzahl", "1793534700.5", expectedSig(KEY, "1793534700.5")],
  ])("lehnt %s ab, ohne zu werfen", (_label, exp, sig) => {
    expect(verifyLocalMediaSignature(KEY, exp, sig, NOW)).toBe(false);
  });

  it("lehnt unsichere Keys auch mit passender Signatur ab", () => {
    const exp = 1793534700;
    const key = "../etc/passwd";
    expect(verifyLocalMediaSignature(key, exp, expectedSig(key, exp), NOW)).toBe(false);
  });

  it("lehnt alles ab, wenn kein Secret konfiguriert ist", () => {
    vi.stubEnv("MEDIA_SIGNING_SECRET", "");
    const exp = 1793534700;
    expect(verifyLocalMediaSignature(KEY, exp, createHmac("sha256", "").update(`${KEY}\n${exp}`).digest("hex"), NOW)).toBe(
      false,
    );
  });
});

import { createHmac } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/media/[...key]/route";

import { LocalMediaStorage } from "./local";

const SECRET = "route-secret-route-secret-route-secret";
const KEY = "posts/p1/0-abc-original.webp";
const NOW = new Date("2026-11-01T12:00:00Z"); // 1793534400
const EXP = 1793534700; // NOW + 300 s

function sig(key: string, exp: number | string): string {
  return createHmac("sha256", SECRET).update(`${key}\n${exp}`).digest("hex");
}

function call(segments: string[], query: string): Promise<Response> {
  const request = new Request(`http://localhost:3000/api/media/${segments.join("/")}${query}`);
  return GET(request, { params: Promise.resolve({ key: segments }) });
}

let workDir: string;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("STORAGE_DRIVER", "local");
  vi.stubEnv("MEDIA_SIGNING_SECRET", SECRET);
  workDir = await mkdtemp(path.join(tmpdir(), "happyfeet-route-"));
  vi.spyOn(process, "cwd").mockReturnValue(workDir);
  await new LocalMediaStorage().put(KEY, Buffer.from("WEBPDATA"), "image/webp");
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(workDir, { recursive: true, force: true });
});

describe("GET /api/media/[...key]", () => {
  it("liefert die Datei für eine gültige Signatur aus", async () => {
    const res = await call(KEY.split("/"), `?exp=${EXP}&sig=${sig(KEY, EXP)}`);

    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("WEBPDATA");
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("content-length")).toBe(String("WEBPDATA".length));
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
  });

  it("funktioniert mit einer vom lokalen Treiber erzeugten URL", async () => {
    const url = await new LocalMediaStorage().signedUrl(KEY, 300);
    const [pathname, query] = url.split("?");
    const res = await call(pathname.replace("/api/media/", "").split("/"), `?${query}`);
    expect(res.status).toBe(200);
  });

  it("begrenzt das Caching auf die Restlaufzeit der Signatur", async () => {
    vi.setSystemTime(new Date("2026-11-01T12:03:20Z")); // 200 s später
    const res = await call(KEY.split("/"), `?exp=${EXP}&sig=${sig(KEY, EXP)}`);
    expect(res.headers.get("cache-control")).toBe("private, max-age=100");
  });

  it.each([undefined, "supabase", "", "LOCAL"])("antwortet 404, wenn STORAGE_DRIVER=%j", async (driver) => {
    vi.stubEnv("STORAGE_DRIVER", driver);
    const res = await call(KEY.split("/"), `?exp=${EXP}&sig=${sig(KEY, EXP)}`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("WEBPDATA");
  });

  it("antwortet in Produktion immer 404", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await call(KEY.split("/"), `?exp=${EXP}&sig=${sig(KEY, EXP)}`);
    expect(res.status).toBe(404);
  });

  it("antwortet 403 nach Ablauf", async () => {
    vi.setSystemTime(new Date("2026-11-01T12:05:00Z"));
    const res = await call(KEY.split("/"), `?exp=${EXP}&sig=${sig(KEY, EXP)}`);
    expect(res.status).toBe(403);
  });

  it.each([
    ["manipulierte Signatur", `?exp=${EXP}&sig=${"0".repeat(64)}`],
    ["verlängerter Ablauf", `?exp=${EXP + 3600}&sig=${sig(KEY, EXP)}`],
    ["Signatur eines fremden Keys", `?exp=${EXP}&sig=${sig("posts/p1/0-abc-preview.webp", EXP)}`],
    ["ohne Parameter", ""],
    ["ohne Signatur", `?exp=${EXP}`],
  ])("antwortet 403 bei %s", async (_label, query) => {
    const res = await call(KEY.split("/"), query);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("WEBPDATA");
  });

  it.each([
    [["..", "secret.webp"]],
    [["posts", "..", "..", "secret.webp"]],
    [["..%2Fsecret.webp"]],
    [["../secret.webp"]],
    [["", "secret.webp"]],
    [["posts", "a\\..\\..\\secret.webp"]],
  ])("liefert nie Dateien ausserhalb des Medienordners (%j), selbst mit gültiger Signatur", async (segments) => {
    await mkdir(path.join(workDir, ".data"), { recursive: true });
    await writeFile(path.join(workDir, ".data", "secret.webp"), "GEHEIM");
    await writeFile(path.join(workDir, "secret.webp"), "GEHEIM");
    const key = segments.join("/");

    const res = await call(segments, `?exp=${EXP}&sig=${sig(key, EXP)}`);

    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("GEHEIM");
  });

  it("antwortet 404 für fehlende Dateien mit gültiger Signatur", async () => {
    const key = "posts/p1/fehlt.webp";
    const res = await call(key.split("/"), `?exp=${EXP}&sig=${sig(key, EXP)}`);
    expect(res.status).toBe(404);
  });

  it("liefert keine Nicht-Bild-Dateien aus, selbst mit gültiger Signatur", async () => {
    const key = "posts/p1/x.html";
    await writeFile(path.join(workDir, ".data", "media", "posts", "p1", "x.html"), "<script>alert(1)</script>");
    const res = await call(key.split("/"), `?exp=${EXP}&sig=${sig(key, EXP)}`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("<script>");
  });
});

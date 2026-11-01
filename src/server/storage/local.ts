import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { isSafeMediaKey } from "./keys";
import { expiryUnixSeconds, type MediaStorage } from "./types";

/**
 * Dev-Treiber: legt Dateien unter `.data/media/<key>` ab und liefert sie über
 * `/api/media/<key>?exp=…&sig=…` aus (HMAC-signiert, ablaufend). Nie in Produktion verwenden.
 */

const MIN_SECRET_LENGTH = 32;
const SIG_PATTERN = /^[0-9a-f]{64}$/;
const EXP_PATTERN = /^[1-9][0-9]{0,11}$/;

/** Der lokale Treiber liefert nur diese Typen aus; der Content-Type folgt aus der Dateiendung. */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function defaultLocalMediaRoot(): string {
  return path.join(process.cwd(), ".data", "media");
}

function contentTypeForKey(key: string): string | null {
  return CONTENT_TYPES[path.extname(key).toLowerCase()] ?? null;
}

/** Absoluter Dateipfad für einen Key – oder `null`, wenn der Key aus dem Medienordner ausbrechen würde. */
function resolveMediaPath(rootDir: string, key: string): string | null {
  if (!isSafeMediaKey(key)) return null;
  const root = path.resolve(rootDir);
  const file = path.resolve(root, key);
  return file.startsWith(root + path.sep) ? file : null;
}

function readSecret(): string | null {
  const secret = process.env.MEDIA_SIGNING_SECRET ?? "";
  return secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

function requireSecret(): string {
  const secret = readSecret();
  if (!secret) {
    throw new Error(`MEDIA_SIGNING_SECRET fehlt oder ist kürzer als ${MIN_SECRET_LENGTH} Zeichen (siehe .env.example).`);
  }
  return secret;
}

function sign(secret: string, key: string, exp: string): string {
  return createHmac("sha256", secret).update(`${key}\n${exp}`).digest("hex");
}

export class LocalMediaStorage implements MediaStorage {
  readonly rootDir: string;

  constructor(opts: { rootDir?: string } = {}) {
    this.rootDir = path.resolve(/*turbopackIgnore: true*/ opts.rootDir ?? defaultLocalMediaRoot());
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const file = resolveMediaPath(this.rootDir, key);
    if (!file) throw new Error(`Unsicherer Medien-Key: ${JSON.stringify(key)}`);
    const expected = contentTypeForKey(key);
    if (expected !== contentType) {
      throw new Error(`Content-Type ${contentType} passt nicht zum Key ${key} (erwartet: ${expected ?? "Bild-Endung"}).`);
    }
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    if (!isSafeMediaKey(key)) throw new Error(`Unsicherer Medien-Key: ${JSON.stringify(key)}`);
    const exp = String(expiryUnixSeconds(expiresInSeconds));
    const sig = sign(requireSecret(), key, exp);
    return `/api/media/${key}?exp=${exp}&sig=${sig}`;
  }

  async remove(keys: string[]): Promise<void> {
    await Promise.all(
      keys.map(async (key) => {
        const file = resolveMediaPath(this.rootDir, key);
        if (file) await rm(file, { force: true });
      }),
    );
  }
}

/**
 * Prüft Signatur und Ablauf einer lokalen Medien-URL (timing-safe).
 * Wirft nie – jede ungültige Eingabe ergibt `false`.
 */
export function verifyLocalMediaSignature(
  key: string,
  exp: string | number,
  sig: string,
  now: Date = new Date(),
): boolean {
  const expStr = String(exp);
  if (!isSafeMediaKey(key) || !EXP_PATTERN.test(expStr) || typeof sig !== "string" || !SIG_PATTERN.test(sig)) {
    return false;
  }
  if (Math.floor(now.getTime() / 1000) >= Number(expStr)) return false;
  const secret = readSecret();
  if (!secret) return false;
  const expected = Buffer.from(sign(secret, key, expStr), "hex");
  return timingSafeEqual(expected, Buffer.from(sig, "hex"));
}

/** Liest eine lokal gespeicherte Mediendatei; `null` bei fehlender Datei oder unsicherem Key. */
export async function readLocalMedia(
  key: string,
  rootDir: string = defaultLocalMediaRoot(),
): Promise<{ data: Buffer; contentType: string } | null> {
  const file = resolveMediaPath(rootDir, key);
  const contentType = contentTypeForKey(key);
  if (!file || !contentType) return null;
  try {
    // Nur Dev-Treiber: kein Datei-Tracing für Produktions-Bundles (lokaler Storage ist dort verboten).
    return { data: await readFile(/*turbopackIgnore: true*/ file), contentType };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EISDIR" || code === "ENOTDIR") return null;
    throw error;
  }
}

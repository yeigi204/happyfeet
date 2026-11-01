import "server-only";

import { randomUUID } from "node:crypto";

const MAX_KEY_LENGTH = 512;
const KEY_CHARS = /^[a-zA-Z0-9/_.-]+$/;
const ID_SEGMENT = /^[a-zA-Z0-9_-]+$/;

/**
 * Erzeugt die Storage-Keys für ein Bild eines Posts.
 * Die Zufalls-ID macht Keys nicht erratbar und verhindert Kollisionen bei erneutem Upload.
 */
export function mediaKeys(postId: string, position: number): { originalKey: string; previewKey: string } {
  if (!ID_SEGMENT.test(postId)) {
    throw new RangeError(`Ungültige Post-ID für Medien-Key: ${JSON.stringify(postId)}`);
  }
  if (!Number.isInteger(position) || position < 0) {
    throw new RangeError(`Ungültige Bildposition: ${position}`);
  }
  const base = `posts/${postId}/${position}-${randomUUID()}`;
  return { originalKey: `${base}-original.webp`, previewKey: `${base}-preview.webp` };
}

/**
 * Prüft, ob ein Key gefahrlos als relativer Pfad verwendet werden kann:
 * nur `[a-zA-Z0-9/_.-]`, kein `..`, kein führender `/`, keine leeren oder `.`-Segmente.
 */
export function isSafeMediaKey(key: string): boolean {
  if (typeof key !== "string" || key.length === 0 || key.length > MAX_KEY_LENGTH) return false;
  if (!KEY_CHARS.test(key) || key.includes("..")) return false;
  return key.split("/").every((segment) => segment !== "" && segment !== ".");
}

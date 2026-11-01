import { POST_LIMITS } from "@/lib/domain/posts";
import { formatNumber } from "@/lib/format";

/**
 * Client-seitige Vorprüfung für neue Posts – spiegelt `POST_LIMITS` (verbindlich prüft `createPost`
 * auf dem Server, inkl. echter Bildformat-Erkennung via sharp).
 */

export type UploadCandidate = { name: string; size: number; type: string; lastModified: number };

export type RejectedFile = { name: string; reason: string };

const MB = 1024 * 1024;
const ALLOWED: readonly string[] = POST_LIMITS.allowedMimeTypes;

export const ACCEPT_ATTRIBUTE = POST_LIMITS.allowedMimeTypes.join(",");
export const MAX_IMAGE_MB = POST_LIMITS.maxImageBytes / MB;

/** „4.2 MB“ – eine Nachkommastelle, Schweizer Format. */
export function formatMegabytes(bytes: number): string {
  return `${formatNumber(Math.max(0.1, Math.round((bytes / MB) * 10) / 10))} MB`;
}

function sameFile(a: UploadCandidate, b: UploadCandidate): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

/**
 * Teilt neu gewählte Dateien in angenommene und abgelehnte (mit deutschem Grund).
 * Berücksichtigt die bereits gewählten Bilder (Höchstzahl, Duplikate).
 */
export function screenFiles<T extends UploadCandidate>(
  incoming: readonly T[],
  existing: readonly UploadCandidate[],
): { accepted: T[]; rejected: RejectedFile[] } {
  const accepted: T[] = [];
  const rejected: RejectedFile[] = [];
  for (const file of incoming) {
    if (!ALLOWED.includes(file.type)) {
      rejected.push({ name: file.name, reason: "kein JPEG, PNG oder WebP" });
    } else if (file.size > POST_LIMITS.maxImageBytes) {
      rejected.push({ name: file.name, reason: `${formatMegabytes(file.size)} – erlaubt sind höchstens ${MAX_IMAGE_MB} MB` });
    } else if (file.size === 0) {
      rejected.push({ name: file.name, reason: "die Datei ist leer" });
    } else if ([...existing, ...accepted].some((other) => sameFile(other, file))) {
      rejected.push({ name: file.name, reason: "schon ausgewählt" });
    } else if (existing.length + accepted.length >= POST_LIMITS.maxImages) {
      rejected.push({ name: file.name, reason: `mehr als ${POST_LIMITS.maxImages} Bilder pro Post` });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

/** Verschiebt ein Element (unveränderlich). Ungültige Indizes → unverändert. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const copy = [...items];
  if (from < 0 || from >= copy.length || to < 0 || to >= copy.length || from === to) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

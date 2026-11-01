/**
 * Rücksprung-Ziele aus einer Checkout-Session absichern (reine Funktionen, ohne I/O).
 *
 * Die Session ist zwar signiert, trotzdem leiten wir nur innerhalb der eigenen App weiter:
 * relative Pfade oder absolute URLs mit genau dem Origin der App. Alles andere – fremde Hosts,
 * protokoll-relative Ziele (`//host`), Backslashes, Steuerzeichen, `javascript:` – ergibt `null`.
 */
export function toSafeLocalPath(target: string, appOrigin: string): string | null {
  if (typeof target !== "string" || target.length === 0 || target.length > 2000) return null;
  // Browser entfernen Tabs/Zeilenumbrüche und behandeln „\“ wie „/“ – solche Ziele gar nicht erst zulassen.
  if (/[\s\u0000-\u001f\u007f\\]/.test(target)) return null;

  let base: URL;
  let url: URL;
  try {
    base = new URL(appOrigin);
    url = new URL(target, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.origin !== base.origin) return null;

  const path = `${url.pathname}${url.search}${url.hash}`;
  // `http://app//evil.example` hätte den Pfad „//evil.example“ – als Redirect wäre das ein fremder Host.
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

const CREATOR_PATH = /^\/c\/([a-z0-9_]{3,24})(?:[/?#]|$)/;

/** Handle aus einem Profil-Pfad (`/c/<handle>…`), sonst `null`. */
export function creatorHandleFromPath(path: string | null): string | null {
  if (!path) return null;
  return CREATOR_PATH.exec(path)?.[1] ?? null;
}

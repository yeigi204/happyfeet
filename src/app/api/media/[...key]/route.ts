import { isSafeMediaKey } from "@/server/storage/keys";
import { readLocalMedia, verifyLocalMediaSignature } from "@/server/storage/local";

/**
 * Auslieferung für `STORAGE_DRIVER=local` (nur Entwicklung): prüft Key, Ablauf und HMAC-Signatur
 * und liefert die Datei aus `.data/media`. Mit jedem anderen Treiber und in Produktion: 404.
 */

const ERROR_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function notFound(): Response {
  return new Response("Nicht gefunden.", { status: 404, headers: ERROR_HEADERS });
}

function forbidden(): Response {
  return new Response("Kein Zugriff.", { status: 403, headers: ERROR_HEADERS });
}

export async function GET(request: Request, ctx: { params: Promise<{ key: string[] }> }): Promise<Response> {
  if (process.env.STORAGE_DRIVER !== "local" || process.env.NODE_ENV === "production") {
    return notFound();
  }

  const { key: segments } = await ctx.params;
  const key = Array.isArray(segments) ? segments.join("/") : "";
  const { searchParams } = new URL(request.url);
  const exp = searchParams.get("exp") ?? "";
  const sig = searchParams.get("sig") ?? "";
  const now = new Date();

  if (!isSafeMediaKey(key) || !verifyLocalMediaSignature(key, exp, sig, now)) {
    return forbidden();
  }

  const file = await readLocalMedia(key);
  if (!file) return notFound();

  const remainingSeconds = Math.max(0, Number(exp) - Math.floor(now.getTime() / 1000));
  return new Response(new Uint8Array(file.data), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.data.length),
      "Cache-Control": `private, max-age=${remainingSeconds}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

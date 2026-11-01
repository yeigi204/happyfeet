import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { isDevImpersonation } from "@/server/auth/dev-impersonation";
import { RETURN_PATH_HEADER, returnPathFromUrl } from "@/server/auth/return-path";

/**
 * Stellt Clerk die Session für jede Anfrage bereit – mehr nicht.
 *
 * Bewusst KEINE pfadbasierten Schutzregeln (Clerk hat `createRouteMatcher` abgekündigt): Pfad-Matching
 * kann vom tatsächlichen Next.js-Routing abweichen. Geschützt wird an der Ressource selbst –
 * Layouts/Pages rufen `requireViewer()`/`requireOnboardedViewer()`/`requireCreator()`/`requireAdmin()`
 * aus `src/server/auth/viewer.ts`, Services prüfen zusätzlich mit den Guards.
 *
 * Zusätzlich bekommt jede Anfrage den aktuellen Pfad als Request-Header `x-hf-return-path` (ein vom
 * Client mitgeschickter Wert wird überschrieben) – für `?redirect_url=` nach der Anmeldung.
 */
function nextWithReturnPath(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set(RETURN_PATH_HEADER, returnPathFromUrl(request.nextUrl));
  return NextResponse.next({ request: { headers } });
}

/**
 * Grosse Request-Bodies (bis 105 MB, siehe next.config.ts) sind nur für den Post-Upload nötig.
 * Überall sonst früh mit 413 ablehnen, bevor Next den Body puffert (Speicher-DoS durch Anonyme).
 */
export const UPLOAD_PATHS: ReadonlySet<string> = new Set(["/studio/posts/new"]);
export const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;

export function rejectOversizedBody(request: NextRequest): NextResponse | null {
  if (request.method === "GET" || request.method === "HEAD") return null;
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length <= DEFAULT_MAX_BODY_BYTES) return null;
  if (UPLOAD_PATHS.has(request.nextUrl.pathname)) return null;
  return new NextResponse("Anfrage zu gross.", { status: 413 });
}

const withClerk = clerkMiddleware((_auth, request) => nextWithReturnPath(request));

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const tooLarge = rejectOversizedBody(request);
  if (tooLarge) return tooLarge;
  // Dev-Impersonation: Clerk komplett umgehen (wirft in Produktion, siehe dev-impersonation.ts).
  if (isDevImpersonation()) return nextWithReturnPath(request);
  return withClerk(request, event);
}

export const config = {
  matcher: [
    // Alles ausser Next-Interna und statischen Dateien …
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // … und API-Routen immer.
    "/(api|trpc)(.*)",
  ],
};

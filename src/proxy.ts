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

const withClerk = clerkMiddleware((_auth, request) => nextWithReturnPath(request));

export default function proxy(request: NextRequest, event: NextFetchEvent) {
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

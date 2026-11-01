import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { isDevImpersonation } from "@/server/auth/dev-impersonation";

/**
 * Stellt Clerk die Session für jede Anfrage bereit – mehr nicht.
 *
 * Bewusst KEINE pfadbasierten Schutzregeln (Clerk hat `createRouteMatcher` abgekündigt): Pfad-Matching
 * kann vom tatsächlichen Next.js-Routing abweichen. Geschützt wird an der Ressource selbst –
 * Layouts/Pages rufen `requireViewer()`/`requireOnboardedViewer()`/`requireCreator()`/`requireAdmin()`
 * aus `src/server/auth/viewer.ts`, Services prüfen zusätzlich mit den Guards.
 */
const withClerk = clerkMiddleware();

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // Dev-Impersonation: Clerk komplett umgehen (wirft in Produktion, siehe dev-impersonation.ts).
  if (isDevImpersonation()) return NextResponse.next();
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

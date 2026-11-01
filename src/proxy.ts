import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { isDevImpersonation } from "@/server/auth/dev-impersonation";

/**
 * Optimistische Weiterleitung für angemeldete Bereiche. Die eigentliche Autorisierung
 * (gesperrt, onboardet, Creator, Admin) passiert serverseitig in `src/server/auth/viewer.ts` und den Services.
 */
const isProtectedRoute = createRouteMatcher([
  "/studio(.*)",
  "/admin(.*)",
  "/feed(.*)",
  "/subscriptions(.*)",
  "/onboarding(.*)",
  "/checkout(.*)",
]);

const withClerk = clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) await auth.protect();
});

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

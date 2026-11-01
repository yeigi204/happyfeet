import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import type { Viewer } from "@/lib/domain/types";
import { findViewerByClerkId, upsertUserFromClerk } from "@/server/services/users";

import { getImpersonatedClerkId } from "./dev-impersonation";
import type { CreatorViewer } from "./guards";

/**
 * Der angemeldete Nutzer – pro Request einmal geladen (React `cache`).
 *
 * - Dev-Impersonation: Seed-User mit `DEV_IMPERSONATE_CLERK_ID`, ohne jeden Clerk-Aufruf.
 * - Sonst: Clerk-Session → `users.clerk_id`. Fehlt die Zeile (Webhook noch nicht da),
 *   wird sie aus dem Clerk-Profil lazy angelegt.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const impersonated = getImpersonatedClerkId();
  if (impersonated) {
    const viewer = await findViewerByClerkId(impersonated);
    if (!viewer) {
      console.warn(
        `[auth] DEV_IMPERSONATE_CLERK_ID="${impersonated}" ist keinem Nutzer zugeordnet – \`npm run db:seed\` ausführen?`,
      );
    }
    return viewer;
  }

  const { userId } = await auth();
  if (!userId) return null;

  const existing = await findViewerByClerkId(userId);
  if (existing) return existing;

  // Clerk-Profil nur für die E-Mail; ist es nicht abrufbar, legen wir den Nutzer trotzdem an
  // (der Webhook ergänzt die E-Mail später).
  const profile = await currentUser().catch((error: unknown) => {
    console.warn("[auth] Clerk-Profil nicht abrufbar, lege Nutzer ohne E-Mail an", error);
    return null;
  });
  await upsertUserFromClerk({
    clerkId: userId,
    email: profile?.primaryEmailAddress?.emailAddress ?? null,
    imageUrl: profile?.imageUrl ?? null,
  });
  return findViewerByClerkId(userId);
});

/** Angemeldet – sonst zur Anmeldung. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  return viewer;
}

/** Angemeldet, nicht gesperrt und Onboarding abgeschlossen – sonst passende Weiterleitung. */
export async function requireOnboardedViewer(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (viewer.status === "banned") redirect("/banned");
  if (!viewer.onboarded) redirect("/onboarding");
  return viewer;
}

/** Wie `requireOnboardedViewer`, zusätzlich mit Creator-Profil (egal welcher Prüfstatus). */
export async function requireCreator(): Promise<CreatorViewer> {
  const viewer = await requireOnboardedViewer();
  if (!viewer.creator) redirect("/studio/become-creator");
  return viewer as CreatorViewer;
}

/** Nur aktive Admins. Alle anderen (auch Abgemeldete) sehen eine 404 – der Admin-Bereich verrät sich nicht. */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer || !viewer.isAdmin || viewer.status !== "active") notFound();
  return viewer;
}

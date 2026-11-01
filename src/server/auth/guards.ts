import "server-only";

import type { Viewer } from "@/lib/domain/types";
import { AuthError, ForbiddenError } from "@/server/errors";

/**
 * Reine Autorisierungs-Guards für Services. Sie bauen aufeinander auf:
 *
 *   assertAuthenticated → assertActive → assertOnboarded → assertCreator → assertApprovedCreator
 *                                      ↘ assertAdmin
 *
 * Jeder Guard prüft also auch alle Stufen davor (z. B. ist ein gesperrter Admin kein Admin).
 * Für Seiten-Redirects (statt Fehlern) siehe `viewer.ts` (`require*`).
 */

export type CreatorViewer = Viewer & { creator: NonNullable<Viewer["creator"]> };

export const BANNED_MESSAGE = "Dein Konto ist gesperrt.";

export function assertAuthenticated(v: Viewer | null | undefined): asserts v is Viewer {
  if (!v) throw new AuthError();
}

export function assertActive(v: Viewer | null | undefined): asserts v is Viewer {
  assertAuthenticated(v);
  if (v.status === "banned") throw new ForbiddenError(BANNED_MESSAGE);
}

export function assertOnboarded(v: Viewer | null | undefined): asserts v is Viewer {
  assertActive(v);
  if (!v.onboarded) throw new ForbiddenError("Bitte richte zuerst dein Profil ein.");
}

export function assertAdmin(v: Viewer | null | undefined): asserts v is Viewer {
  assertActive(v);
  if (!v.isAdmin) throw new ForbiddenError();
}

export function assertCreator(v: Viewer | null | undefined): asserts v is CreatorViewer {
  assertOnboarded(v);
  if (!v.creator) throw new ForbiddenError("Dafür brauchst du ein Creator-Profil.");
}

export function assertApprovedCreator(v: Viewer | null | undefined): asserts v is CreatorViewer {
  assertCreator(v);
  if (v.creator.verificationStatus !== "approved") {
    throw new ForbiddenError("Dein Creator-Profil ist noch nicht freigeschaltet.");
  }
}

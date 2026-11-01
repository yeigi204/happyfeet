import type { ReactNode } from "react";

import { requireOnboardedViewer } from "@/server/auth/viewer";

/**
 * Zugangsschranke vor dem Streaming: so antwortet /feed Gästen mit einer echten Weiterleitung
 * (statt erst den Lade-Zustand zu senden). Die Seite prüft den Viewer zusätzlich selbst.
 */
export default async function FeedLayout({ children }: { children: ReactNode }) {
  await requireOnboardedViewer();
  return children;
}

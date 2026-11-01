import type { ReactNode } from "react";

import { requireOnboardedViewer } from "@/server/auth/viewer";

/** Zugangsschranke vor dem Streaming (echte Weiterleitung für Gäste); die Seite prüft zusätzlich selbst. */
export default async function SubscriptionsLayout({ children }: { children: ReactNode }) {
  await requireOnboardedViewer();
  return children;
}

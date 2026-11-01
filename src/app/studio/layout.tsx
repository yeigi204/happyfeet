import { AppShell } from "@/components/shell/app-shell";
import { StatusBanner } from "@/components/studio/status-banner";
import { StudioBar } from "@/components/studio/studio-bar";
import type { CreatorViewer } from "@/server/auth/guards";
import { requireOnboardedViewer } from "@/server/auth/viewer";
import { getMyCreatorProfile } from "@/server/services/creators";

/**
 * Rahmen des Creator-Studios. Nur die gemeinsame Schranke (angemeldet, nicht gesperrt, Onboarding fertig).
 * Die Studio-Seiten liegen in der Gruppe `(creator)` (Layout mit `requireCreator()`); die Bewerbung liegt
 * bewusst ausserhalb und nutzt `requireOnboardedViewer()` – sonst Weiterleitungsschleife für Nutzer ohne Profil.
 * Jede Seite prüft den Viewer zusätzlich selbst.
 */
export default async function StudioLayout({ children }: LayoutProps<"/studio">) {
  const viewer = await requireOnboardedViewer();
  const status = viewer.creator?.verificationStatus;
  const note = status === "rejected" ? ((await getMyCreatorProfile(viewer))?.verificationNote ?? null) : null;

  return (
    <AppShell>
      {viewer.creator ? <StudioBar viewer={viewer as CreatorViewer} /> : null}
      {status === "pending" || status === "rejected" ? <StatusBanner status={status} note={note} /> : null}
      {children}
    </AppShell>
  );
}

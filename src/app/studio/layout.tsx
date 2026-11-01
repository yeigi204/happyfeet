import { SiteHeader } from "@/components/site/site-header";
import { StatusBanner } from "@/components/studio/status-banner";
import { StudioBar } from "@/components/studio/studio-bar";
import type { CreatorViewer } from "@/server/auth/guards";
import { requireOnboardedViewer } from "@/server/auth/viewer";
import { getMyCreatorProfile } from "@/server/services/creators";

/**
 * Rahmen des Creator-Studios. Nur die gemeinsame Schranke (angemeldet, nicht gesperrt, Onboarding fertig) –
 * jede Seite prüft selbst weiter: Studio-Seiten mit `requireCreator()`, die Bewerbung mit
 * `requireOnboardedViewer()` (sonst Weiterleitungsschleife für Nutzer ohne Creator-Profil).
 */
export default async function StudioLayout({ children }: LayoutProps<"/studio">) {
  const viewer = await requireOnboardedViewer();
  const status = viewer.creator?.verificationStatus;
  const note = status === "rejected" ? ((await getMyCreatorProfile(viewer))?.verificationNote ?? null) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <a
        href="#inhalt"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-control focus:bg-ink focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-canvas"
      >
        Zum Inhalt springen
      </a>
      <SiteHeader />
      {viewer.creator ? <StudioBar viewer={viewer as CreatorViewer} /> : null}
      <main id="inhalt" tabIndex={-1} className="flex-1 pb-24 outline-none">
        {status === "pending" || status === "rejected" ? <StatusBanner status={status} note={note} /> : null}
        {children}
      </main>
    </div>
  );
}

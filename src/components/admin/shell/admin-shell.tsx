import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import type { ThemePreference } from "@/lib/theme";

import { AdminBrand, AdminNav, type AdminCounts } from "./admin-nav";
import { CommandPalette, CommandPaletteTrigger, type QuickSearch } from "./command-palette";
import { Shortcuts } from "./shortcuts";

export type { AdminCounts, QuickSearch };

export type AdminShellProps = {
  children: ReactNode;
  counts: AdminCounts;
  /** Server Action für die Nutzersuche in der ⌘K-Palette. */
  quickSearch?: QuickSearch;
  /** Aktiven Navigationspunkt erzwingen (Standard: aktueller Pfad). Für Vorschauen/Design-System. */
  activeHref?: string;
  /** Theme-Wahl (Cookie) für den Darstellungs-Umschalter. */
  theme: ThemePreference;
};

/**
 * Admin-Rahmen im globalen Theme (Hell/Dunkel): Seitenleiste mit Warteschlangen-Zählern ab `lg`,
 * obere Leiste mit Suche (⌘K) und Darstellung, mobil Pillen-Navigation. Globale Kürzel und Befehlspalette.
 */
export function AdminShell({ children, counts, quickSearch, activeHref, theme }: AdminShellProps) {
  return (
    <div className="min-h-dvh bg-canvas text-ink lg:grid lg:grid-cols-[236px_minmax(0,1fr)]">
      <a
        href="#admin-main"
        className="sr-only z-50 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-canvas focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Zum Inhalt springen
      </a>
      <AdminNav counts={counts} activeHref={activeHref} />
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-canvas/92 px-4 backdrop-blur-md sm:px-6 lg:px-9">
          <AdminBrand className="mr-2 lg:hidden" />
          <CommandPaletteTrigger className="max-sm:hidden" />
          <div className="flex-1" />
          <CommandPaletteTrigger className="w-10 justify-center px-0 sm:hidden [&>span]:sr-only" />
          <ThemeToggle value={theme} variant="compact" />
        </header>
        <main id="admin-main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 outline-none sm:px-6 lg:px-9 lg:py-8">
          {children}
        </main>
      </div>
      <CommandPalette quickSearch={quickSearch} />
      <Shortcuts />
    </div>
  );
}

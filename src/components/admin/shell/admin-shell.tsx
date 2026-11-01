import type { ReactNode } from "react";

import { AdminBrand, AdminNav, type AdminCounts } from "./admin-nav";
import { CommandPalette, CommandPaletteTrigger, type QuickSearch } from "./command-palette";
import { Shortcuts } from "./shortcuts";
import { Ticker, type TickerItem } from "./ticker";

export type { AdminCounts, QuickSearch, TickerItem };

export type AdminShellProps = {
  children: ReactNode;
  counts: AdminCounts;
  ticker: TickerItem[];
  /** Server Action für die Nutzersuche in der ⌘K-Palette. */
  quickSearch?: QuickSearch;
  /** Aktiven Navigationspunkt erzwingen (Standard: aktueller Pfad). Für Vorschauen/Design-System. */
  activeHref?: string;
};

/**
 * Admin-Rahmen: setzt `.theme-admin` (dunkle Token-Werte), Kopfzeile mit Marke, Ticker und Suche,
 * Navigation mit Warteschlangen-Zählern, ⌘K-Palette und globale Kürzel.
 */
export function AdminShell({ children, counts, ticker, quickSearch, activeHref }: AdminShellProps) {
  return (
    <div className="theme-admin flex min-h-dvh flex-col bg-canvas font-sans text-ink">
      <a
        href="#admin-main"
        className="sr-only z-50 rounded-control bg-accent px-3 py-2 text-sm font-medium text-accent-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Zum Inhalt springen
      </a>

      <header className="sticky top-0 z-30 grid grid-cols-[minmax(0,1fr)_auto] border-b border-line bg-canvas md:grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-cols-[232px_minmax(0,1fr)_auto]">
        <AdminBrand className="h-11 px-4 lg:border-r lg:border-line" />
        <Ticker items={ticker} className="col-span-2 row-start-2 h-10 border-t border-line md:col-span-1 md:col-start-2 md:row-start-1 md:h-11 md:border-t-0 md:border-l" />
        <CommandPaletteTrigger className="h-11 border-l border-line md:col-start-3" />
      </header>

      <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
        <AdminNav counts={counts} activeHref={activeHref} />
        <main id="admin-main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-9">
          {children}
        </main>
      </div>

      <CommandPalette quickSearch={quickSearch} />
      <Shortcuts />
    </div>
  );
}

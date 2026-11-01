"use client";

import { BadgeCheck, LayoutDashboard, ScrollText, Search, Settings2, ShieldCheck, Users, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/components/ui/cn";
import { LogoMark } from "@/components/brand/logo";
import { Kbd } from "@/components/ui/kbd";

import { QueuePill } from "./queue-pill";

/** Event, auf das die Befehlspalette hört (hier definiert, damit keine Import-Zyklen entstehen). */
export const COMMAND_PALETTE_EVENT = "happyfeet:command-palette";

/** Öffnet die Befehlspalette von überall (Navigation, Kürzel, Buttons). */
export function openCommandPalette(): void {
  window.dispatchEvent(new Event(COMMAND_PALETTE_EVENT));
}

export type AdminCounts = { verifications: number; moderation: number; reports: number };

export type AdminNavItem = {
  href: string;
  label: string;
  /** Taste nach `g` (Kürzel `g d` …) */
  key: string;
  icon: LucideIcon;
  group: "Übersicht" | "Warteschlangen" | "Verwaltung";
  keywords: string;
};

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", key: "d", icon: LayoutDashboard, group: "Übersicht", keywords: "übersicht kennzahlen umsatz mrr" },
  { href: "/admin/verifications", label: "Verifizierungen", key: "v", icon: BadgeCheck, group: "Warteschlangen", keywords: "creator anträge prüfung freigeben" },
  { href: "/admin/moderation", label: "Moderation", key: "m", icon: ShieldCheck, group: "Warteschlangen", keywords: "meldungen posts vorab prüfung triage" },
  { href: "/admin/users", label: "Nutzer", key: "u", icon: Users, group: "Verwaltung", keywords: "fans creator sperren konto" },
  { href: "/admin/payouts", label: "Auszahlungen", key: "p", icon: Wallet, group: "Verwaltung", keywords: "payouts guthaben bezahlt" },
  { href: "/admin/settings", label: "Einstellungen", key: "s", icon: Settings2, group: "Verwaltung", keywords: "provision gebühren preise premium" },
  { href: "/admin/audit", label: "Audit-Log", key: "a", icon: ScrollText, group: "Verwaltung", keywords: "protokoll verlauf aktivität" },
];

export function isNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Pills({ href, counts }: { href: string; counts: AdminCounts }) {
  if (href === "/admin/verifications") return <QueuePill count={counts.verifications} label="offene Anträge" />;
  if (href === "/admin/moderation") {
    return (
      <>
        <QueuePill count={counts.moderation} label="Posts in Vorab-Prüfung" />
        <QueuePill count={counts.reports} label="offene Meldungen" tone="alert" />
      </>
    );
  }
  return null;
}

/** Marke: Nagel-Glyphe in Nagellack-Rot + Wortmarke. */
export function AdminBrand({ className }: { className?: string }) {
  return (
    <Link href="/admin" className={cn("flex items-center gap-2.5", className)} aria-label="happyfeet Admin – Dashboard">
      <LogoMark />
      <span aria-hidden className="font-display text-[19px] leading-none font-extrabold tracking-[-0.03em] text-ink">
        happyfeet
      </span>
      <span aria-hidden className="rounded-full bg-surface-2 px-2 py-1 text-[11px] leading-none font-bold text-ink">
        Admin
      </span>
    </Link>
  );
}

export function AdminNav({ counts, activeHref }: { counts: AdminCounts; activeHref?: string }) {
  const pathname = usePathname();
  const current = activeHref ?? pathname;
  const groups = ["Übersicht", "Warteschlangen", "Verwaltung"] as const;

  return (
    <>
      {/* Desktop: feste Leiste links */}
      <nav aria-label="Admin-Navigation" className="hidden border-r border-line lg:sticky lg:top-11 lg:flex lg:h-[calc(100dvh-2.75rem)] lg:flex-col">
        <div className="flex-1 overflow-y-auto px-2.5 py-5">
          {groups.map((group) => (
            <div key={group} className="mb-5">
              <p className="eyebrow px-3 pb-2">{group}</p>
              <ul className="grid gap-px">
                {ADMIN_NAV.filter((i) => i.group === group).map((item) => {
                  const active = isNavActive(current, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex h-9 items-center gap-3 rounded-control px-3 text-[13.5px] text-ink-muted transition-colors duration-100",
                          "hover:bg-surface hover:text-ink aria-[current=page]:bg-surface-2 aria-[current=page]:text-ink",
                        )}
                      >
                        <span aria-hidden className="absolute inset-y-2 -left-2.5 w-[3px] rounded-r-full bg-accent opacity-0 group-aria-[current=page]:opacity-100" />
                        <Icon aria-hidden className="size-4 shrink-0 text-ink-faint group-hover:text-ink-muted group-aria-[current=page]:text-accent" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        <Pills href={item.href} counts={counts} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="grid gap-1 border-t border-line p-2.5">
          <button
            type="button"
            onClick={openCommandPalette}
            className="flex h-9 items-center gap-3 rounded-control px-3 text-[13px] text-ink-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <Search aria-hidden className="size-4 text-ink-faint" />
            <span className="flex-1 text-left">Befehle & Suche</span>
            <span className="flex gap-0.5">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <p className="flex items-center justify-between px-3 py-1.5 text-xs text-ink-faint">
            Alle Kürzel
            <Kbd>?</Kbd>
          </p>
        </div>
      </nav>

      {/* Mobil: horizontale Leiste unter dem Kopf */}
      <nav aria-label="Admin-Navigation" className="relative flex gap-1 overflow-x-auto border-b border-line px-3 py-2 scrollbar-none lg:hidden">
        {ADMIN_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isNavActive(current, item.href) ? "page" : undefined}
              className="group inline-flex h-8 shrink-0 items-center gap-2 rounded-control px-2.5 text-[13px] text-ink-muted aria-[current=page]:bg-surface-2 aria-[current=page]:text-ink"
            >
              <Icon aria-hidden className="size-3.5 text-ink-faint group-aria-[current=page]:text-accent" />
              {item.label}
              <Pills href={item.href} counts={counts} />
            </Link>
          );
        })}
      </nav>
    </>
  );
}

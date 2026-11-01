"use client";

import { ArrowUpRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";

import { cn } from "@/components/ui/cn";

export type SiteNavItem = { href: string; label: string };

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Hauptnavigation: ab `md` als Linkreihe, darunter als ausklappbares Menü.
 * `menuFooter` erscheint nur im mobilen Menü (z. B. Anmelden/Registrieren für Gäste).
 */
export function SiteNav({ items, menuFooter }: { items: SiteNavItem[]; menuFooter?: ReactNode }) {
  const pathname = usePathname();
  const panelId = useId();
  // Das Menü gehört zu dem Pfad, auf dem es geöffnet wurde – nach einer Navigation ist es automatisch zu.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenFor(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <nav aria-label="Hauptnavigation" className="hidden h-full items-stretch gap-1 md:flex">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative inline-flex items-center rounded-control px-3 text-sm font-medium transition-colors duration-100",
                active ? "text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {item.label}
              {active ? <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
            </Link>
          );
        })}
      </nav>

      {items.length > 0 || menuFooter ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpenFor(open ? null : pathname)}
          className="inline-flex size-10 items-center justify-center rounded-control border border-line-strong text-ink transition-colors hover:bg-surface-2 md:hidden"
        >
          {open ? <X aria-hidden className="size-[18px]" /> : <Menu aria-hidden className="size-[18px]" />}
          <span className="sr-only">{open ? "Menü schliessen" : "Menü öffnen"}</span>
        </button>
      ) : null}

      <div id={panelId} hidden={!open} className="md:hidden">
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => setOpenFor(null)}
          className="fixed inset-x-0 top-16 bottom-0 z-30 cursor-default bg-ink/25"
        />
        <div className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-line bg-canvas px-4 pt-2 pb-6 animate-rise sm:px-8">
          <nav aria-label="Hauptnavigation (mobil)">
            <ul className="divide-y divide-line">
              {items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpenFor(null)}
                      className="group flex items-center justify-between gap-4 py-4 font-display text-[26px] leading-none font-bold tracking-[-0.04em] text-ink"
                    >
                      <span className="flex items-center gap-3">
                        {active ? <span aria-hidden className="size-2 rounded-full bg-accent" /> : null}
                        {item.label}
                      </span>
                      <ArrowUpRight aria-hidden className="size-5 text-ink-faint transition-colors group-hover:text-accent" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          {menuFooter ? <div className="mt-5 grid gap-2 border-t border-line pt-5">{menuFooter}</div> : null}
        </div>
      </div>
    </>
  );
}

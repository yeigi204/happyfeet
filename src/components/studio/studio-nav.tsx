"use client";

import { Gem, Images, LayoutGrid, Plus, SlidersHorizontal, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { cn } from "@/components/ui/cn";

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean };

const ITEMS: Item[] = [
  { href: "/studio", label: "Übersicht", icon: LayoutGrid, exact: true },
  { href: "/studio/posts", label: "Posts", icon: Images, exact: true },
  { href: "/studio/posts/new", label: "Neuer Post", icon: Plus },
  { href: "/studio/settings", label: "Einstellungen", icon: SlidersHorizontal },
  { href: "/studio/premium", label: "Premium", icon: Gem },
  { href: "/studio/payouts", label: "Auszahlungen", icon: Wallet },
];

function isActive(pathname: string, item: Item): boolean {
  if (pathname === item.href) return true;
  return !item.exact && pathname.startsWith(`${item.href}/`);
}

/**
 * Studio-Unternavigation: Tabs mit Akzent-Unterstrich. Auf dem Handy horizontal scrollbar – der aktive Tab
 * wird in den sichtbaren Bereich geschoben, ein Verlauf am Rand zeigt, dass es weitergeht.
 */
export function StudioNav() {
  const pathname = usePathname();
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    const active = el?.querySelector<HTMLElement>("[aria-current=page]");
    if (!el || !active || el.scrollWidth <= el.clientWidth) return;
    const target = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
    el.scrollLeft = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth));
  }, [pathname]);

  return (
    <div className="relative -mx-4 sm:-mx-8 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-10 after:bg-linear-to-l after:from-surface after:to-transparent md:after:hidden">
      <div ref={scroller} className="overflow-x-auto px-4 scrollbar-none sm:px-8">
        <nav aria-label="Studio">
          <ul className="-ml-2.5 flex min-w-max items-stretch gap-0.5 pr-6 md:pr-0">
            {ITEMS.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <li key={item.href} className="flex">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative inline-flex h-12 items-center gap-2 rounded-control px-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-100",
                      // Der Scroll-Container schneidet einen äusseren Fokusring oben/unten ab – deshalb innen.
                      "focus-visible:-outline-offset-2",
                      "[&_svg]:size-4 [&_svg]:shrink-0",
                      active ? "text-ink" : "text-ink-muted hover:text-ink",
                    )}
                  >
                    <Icon aria-hidden className={active ? "text-accent" : "text-ink-faint"} />
                    {item.label}
                    {active ? <span aria-hidden className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

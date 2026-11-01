"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/components/ui/cn";

import { NAV_ICONS } from "./nav-icon";
import { NEW_POST_HREF, isNavItemActive, type ShellNavItem } from "./nav-items";

/** Mobile Tab-Leiste (unter `lg`), fix am unteren Rand inkl. Safe-Area. Admin erreicht man über die obere Leiste. */
export function TabBar({ items, canPost }: { items: ShellNavItem[]; canPost: boolean }) {
  const pathname = usePathname();
  const tabs = items.filter((i) => i.icon !== "admin");
  const middle = Math.ceil(tabs.length / 2);
  const cells = canPost ? [...tabs.slice(0, middle), null, ...tabs.slice(middle)] : tabs;

  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg px-1.5 pt-1.5 pb-2" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
        {cells.map((item) => {
          if (!item) {
            return (
              <li key="new-post" className="grid place-items-center">
                <Link href={NEW_POST_HREF} aria-label="Neuer Post" className="grid h-9 w-12 place-items-center rounded-control bg-accent text-accent-ink">
                  <Plus aria-hidden className="size-5" />
                </Link>
              </li>
            );
          }
          const active = isNavItemActive(pathname, item.href);
          const Icon = NAV_ICONS[item.icon];
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("grid justify-items-center gap-0.5 rounded-control py-1 text-[10.5px] font-semibold", active ? "text-ink" : "text-ink-muted")}
              >
                <Icon aria-hidden className={cn("size-[22px]", active && "text-accent")} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import { Gem, Images, LayoutGrid, Plus, SlidersHorizontal, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

/** Studio-Unternavigation: Tabs mit Akzent-Unterstrich; auf dem Handy horizontal scrollbar. */
export function StudioNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Studio" className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:-mx-8 sm:px-8">
      <ul className="flex min-w-max items-stretch gap-1">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-12 items-center gap-2 rounded-control px-3 text-sm font-medium whitespace-nowrap transition-colors duration-100",
                  "first:-ml-3 [&_svg]:size-4 [&_svg]:shrink-0",
                  active ? "text-ink" : "text-ink-muted hover:text-ink",
                )}
              >
                <Icon aria-hidden className={active ? "text-accent" : "text-ink-faint"} />
                {item.label}
                {active ? <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

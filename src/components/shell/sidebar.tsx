"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import type { ThemePreference } from "@/lib/theme";

import { NAV_ICONS } from "./nav-icon";
import { NEW_POST_HREF, isNavItemActive, type ShellNavItem } from "./nav-items";

/** Seitenleiste ab `lg`: Logo, Navigation, „Neuer Post“ (freigegebene Creator), unten Konto + Darstellung. */
export function Sidebar({
  items,
  canPost,
  theme,
  account,
  profile,
}: {
  items: ShellNavItem[];
  canPost: boolean;
  theme: ThemePreference;
  /** Konto-Menü (Server Component `UserMenu`). */
  account: ReactNode;
  profile: { name: string; handle: string | null };
}) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-1 border-r border-line bg-canvas px-3.5 py-6 lg:flex">
      <Logo className="mb-5 px-2.5" />
      <nav aria-label="Hauptnavigation" className="grid gap-1">
        {items.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = NAV_ICONS[item.icon];
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-control px-3 py-2.5 text-[14.5px] font-semibold transition-colors",
                active ? "bg-surface-2 text-ink" : "text-ink-muted hover:bg-surface-2/60 hover:text-ink",
              )}
            >
              <Icon aria-hidden className={cn("size-5 shrink-0", active && "text-accent")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {canPost ? (
        <Link href={NEW_POST_HREF} className={buttonClasses({ variant: "primary", className: "mt-3 w-full" })}>
          <Plus aria-hidden />
          Neuer Post
        </Link>
      ) : null}
      <div className="flex-1" />
      <div className="grid gap-3 rounded-control border border-line bg-surface p-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] leading-tight font-bold text-ink">{profile.name}</p>
            {profile.handle ? <p className="truncate text-xs text-ink-muted">@{profile.handle}</p> : null}
          </div>
          <div className="max-w-[60%] shrink-0 overflow-hidden">{account}</div>
        </div>
        <ThemeToggle value={theme} className="flex w-full [&>button]:flex-1 [&>button]:px-1.5" />
      </div>
    </aside>
  );
}

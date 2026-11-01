import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import type { ThemePreference } from "@/lib/theme";

/** Obere Leiste unter `lg`: Logo, (Admin), Darstellung und Konto. */
export function MobileTopBar({ theme, account, showAdmin }: { theme: ThemePreference; account: ReactNode; showAdmin: boolean }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas/92 px-4 backdrop-blur-md lg:hidden">
      <Logo size="sm" />
      <div className="flex-1" />
      {showAdmin ? (
        <Link href="/admin" aria-label="Admin" className="grid size-8 place-items-center rounded-full text-ink-muted hover:bg-surface-2 hover:text-ink">
          <ShieldCheck aria-hidden className="size-5" />
        </Link>
      ) : null}
      <ThemeToggle value={theme} variant="compact" />
      {account}
    </header>
  );
}

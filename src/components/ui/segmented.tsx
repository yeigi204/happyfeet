import Link from "next/link";

import { cn } from "./cn";

export type SegmentedItem = { href: string; label: string; count?: number };

/** Link-basierte Tabs (funktionieren ohne JS, Zustand steckt in der URL). */
export function Segmented({ items, active, label = "Ansicht", className }: { items: SegmentedItem[]; active: string; label?: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("relative inline-flex max-w-full overflow-x-auto rounded-control border border-line bg-surface-2 p-0.5 scrollbar-none", className)}>
      {items.map((item) => {
        const isActive = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-2 rounded-[calc(var(--radius-control)-2px)] px-3 text-[13px] font-medium whitespace-nowrap",
              "text-ink-muted transition-colors duration-100 hover:text-ink",
              "aria-[current=page]:bg-surface aria-[current=page]:text-ink aria-[current=page]:shadow-[0_0_0_1px_var(--color-line-strong)]",
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className={cn("font-num text-[11px] tabular-nums", isActive ? "text-ink" : "text-ink-muted")}>{item.count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

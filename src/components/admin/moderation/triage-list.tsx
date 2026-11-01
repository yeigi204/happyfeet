"use client";

import { ImageOff } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { Kbd } from "@/components/ui/kbd";
import { REPORT_REASONS } from "@/lib/domain/reports";
import { formatNumber, formatRelative } from "@/lib/format";

import { SeverityBadge } from "./severity-badge";
import type { TriageItem, TriageMode } from "./types";

export function triageItemId(key: string): string {
  return `triage-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export type TriageListProps = {
  mode: TriageMode;
  items: TriageItem[];
  activeKey: string | null;
  now: Date;
  onSelect: (index: number) => void;
};

/** Linke Spalte: die Warteschlange. Klick oder `j`/`k` wählt aus. */
export function TriageList({ mode, items, activeKey, now, onSelect }: TriageListProps) {
  return (
    <section aria-label="Warteschlange" className="min-w-0 rounded-card border border-line bg-surface">
      <header className="flex h-11 items-center justify-between gap-3 border-b border-line px-4">
        <h2 className="text-[13px] font-semibold text-ink">
          {mode === "reports" ? "Offene Meldungen" : "Wartende Posts"}
          <span className="ml-2 font-num text-xs font-normal text-ink-faint tabular-nums">{formatNumber(items.length)}</span>
        </h2>
        <span aria-hidden className="hidden items-center gap-1 font-num text-[11px] text-ink-faint sm:flex">
          <Kbd>j</Kbd>
          <Kbd>k</Kbd>
        </span>
      </header>
      <ul className="divide-y divide-line">
        {items.map((item, index) => {
          const active = item.key === activeKey;
          const thumb = item.post.media[0];
          const report = item.kind === "report" ? item.report : null;
          return (
            <li key={item.key}>
              <button
                id={triageItemId(item.key)}
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect(index)}
                className={cn(
                  "group relative grid w-full grid-cols-[48px_minmax(0,1fr)] items-start gap-3 px-4 py-3 text-left transition-colors duration-100",
                  "hover:bg-surface-2/70 focus-visible:-outline-offset-2 aria-[current=true]:bg-surface-2",
                )}
              >
                <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-accent opacity-0 group-aria-[current=true]:opacity-100" />
                <span className="grid size-12 place-items-center overflow-hidden rounded-control border border-line bg-canvas">
                  {thumb ? (
                    <img src={thumb.url} alt="" width={48} height={48} loading="lazy" decoding="async" className="size-full object-cover" />
                  ) : (
                    <ImageOff aria-hidden className="size-4 text-ink-faint" />
                  )}
                </span>
                <span className="grid min-w-0 gap-1">
                  <span className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-medium text-ink">{item.post.creator.displayName}</span>
                    <span className="shrink-0 font-num text-[11px] text-ink-faint">{formatRelative(report?.createdAt ?? item.post.createdAt, now)}</span>
                  </span>
                  {report ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <SeverityBadge severity={report.severity} />
                      <span className="truncate text-xs text-ink-muted">{REPORT_REASONS[report.reason].label}</span>
                    </span>
                  ) : (
                    <span className="flex min-w-0 items-center gap-2 text-xs text-ink-faint">
                      <span className="font-num">@{item.post.creator.handle}</span>
                      <span aria-hidden>·</span>
                      <span className="shrink-0">{item.post.media.length === 1 ? "1 Bild" : `${item.post.media.length} Bilder`}</span>
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

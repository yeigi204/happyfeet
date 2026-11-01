import Link from "next/link";

import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, formatRelative } from "@/lib/format";

import { AUDIT_TONE_CLASSES, AuditSummary } from "../audit/audit-summary";
import { actorLabel, describeAudit, type AuditEntry, type UserDirectory } from "../audit/describe";

export type ActivityItem = AuditEntry & { id: string; createdAt: Date };

/** Die neuesten Audit-Einträge als Zeitleiste. */
export function ActivityFeed({ items, directory, now }: { items: ActivityItem[]; directory: UserDirectory; now: Date }) {
  return (
    <Card
      title="Aktivität"
      action={
        <Link href="/admin/audit" className="text-xs text-ink-muted hover:text-ink">
          Audit-Log →
        </Link>
      }
      flush
    >
      {items.length === 0 ? (
        <div className="p-4">
          <EmptyState title="Noch still hier" description="Freigaben, Sperren und Auszahlungen erscheinen hier, sobald sie passieren." className="border-0 bg-transparent px-0 py-2" />
        </div>
      ) : (
        <ol className="relative px-4 py-3">
          <span aria-hidden className="absolute top-5 bottom-5 left-[25px] w-px bg-line" />
          {items.map((item) => {
            const d = describeAudit(item, directory);
            const Icon = d.icon;
            return (
              <li key={item.id} className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-3 py-2">
                <span className="relative z-10 mt-px grid size-5 place-items-center rounded-full border border-line bg-surface" title={d.label}>
                  <Icon aria-hidden className={cn("size-3", AUDIT_TONE_CLASSES[d.tone])} strokeWidth={2.4} />
                </span>
                <span className="min-w-0">
                  <span className="sr-only">{d.label}: </span>
                  <AuditSummary segments={d.summary} className="block text-[13px] leading-snug" />
                  {d.detail ? <span className="mt-0.5 line-clamp-1 block text-xs text-ink-faint">«{d.detail}»</span> : null}
                  <span className="mt-0.5 block font-num text-[11px] text-ink-faint">
                    <time dateTime={item.createdAt.toISOString()} title={formatDateTime(item.createdAt)}>
                      {formatRelative(item.createdAt, now)}
                    </time>
                    {" · "}
                    {actorLabel(item.actor)}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

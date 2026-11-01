import { BadgeCheck, Check, Flag, ShieldCheck, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { formatChf, formatNumber, formatRelative } from "@/lib/format";

import { urgencyFor } from "../lib/urgency";
import { UrgencyBadge } from "../urgency-badge";

export type DashboardQueues = {
  verifications: { count: number; oldestAt: Date | null };
  premoderation: { count: number; oldestAt: Date | null };
  reports: { count: number; criticalCount: number; oldestAt: Date | null };
  payoutsScheduled: { count: number; totalRappen: number };
};

type QueueRow = { title: string; icon: LucideIcon; count: number; meta: string; oldestAt?: Date | null; critical?: number; href: string };

/** „älteste vor 3 Std.“ bzw. ab einer Woche „älteste vom 20.10.2026“. */
export function oldestLabel(oldestAt: Date, now: Date): string {
  const rel = formatRelative(oldestAt, now);
  return rel.startsWith("vor") || rel === "gerade eben" ? `älteste ${rel}` : `älteste vom ${rel}`;
}

const URGENCY_RANK = { overdue: 2, due: 1, ok: 0 } as const;

/** Warteschlangen mit Alter des ältesten Eintrags – die dringendste zuerst. */
export function QueueList({ queues, now }: { queues: DashboardQueues; now: Date }) {
  const rows: QueueRow[] = [
    {
      title: "Meldungen",
      icon: Flag,
      count: queues.reports.count,
      meta: "Fan-Meldungen zu Posts",
      oldestAt: queues.reports.oldestAt,
      critical: queues.reports.criticalCount,
      href: "/admin/moderation?tab=reports",
    },
    {
      title: "Verifizierungen",
      icon: BadgeCheck,
      count: queues.verifications.count,
      meta: "Creator-Anträge",
      oldestAt: queues.verifications.oldestAt,
      href: "/admin/verifications",
    },
    {
      title: "Vorab-Prüfung",
      icon: ShieldCheck,
      count: queues.premoderation.count,
      meta: "Posts neuer Creator",
      oldestAt: queues.premoderation.oldestAt,
      href: "/admin/moderation",
    },
  ];
  const rank = (r: QueueRow) => ((r.critical ?? 0) > 0 ? 10 : 0) + (r.count > 0 ? URGENCY_RANK[urgencyFor(r.oldestAt, now) ?? "ok"] : -1);
  const sorted = [...rows].sort((a, b) => rank(b) - rank(a));
  const payouts: QueueRow = {
    title: "Auszahlungen",
    icon: Wallet,
    count: queues.payoutsScheduled.count,
    meta: queues.payoutsScheduled.count > 0 ? `geplant · ${formatChf(queues.payoutsScheduled.totalRappen)}` : "nichts geplant",
    href: "/admin/payouts",
  };

  return (
    <Card title="Warteschlangen" action={<span className="font-num text-xs text-ink-faint">dringendste zuerst</span>} flush>
      <ul className="divide-y divide-line">
        {[...sorted, payouts].map((q) => {
          const Icon = q.icon;
          const empty = q.count === 0;
          return (
            <li key={q.title}>
              <Link
                href={q.href}
                className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3.5 transition-colors hover:bg-surface-2 focus-visible:-outline-offset-2"
              >
                <Icon aria-hidden className="size-4 text-ink-faint group-hover:text-ink-muted" />
                <span className="truncate text-[13.5px] font-medium text-ink">{q.title}</span>
                <span className={cn("row-span-2 font-num text-[28px] leading-none font-medium tracking-[-0.04em] tabular-nums", empty ? "text-ink-faint" : "text-ink")}>
                  {formatNumber(q.count)}
                </span>
                <span />
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
                  {empty && q.title !== "Auszahlungen" ? (
                    <Badge tone="success" icon={<Check aria-hidden />}>
                      Erledigt
                    </Badge>
                  ) : null}
                  {!empty && q.oldestAt !== undefined ? <UrgencyBadge oldestAt={q.oldestAt} now={now} /> : null}
                  {q.critical ? <Badge tone="danger">{q.critical === 1 ? "1 kritisch" : `${formatNumber(q.critical)} kritisch`}</Badge> : null}
                  <span>
                    {q.meta}
                    {!empty && q.oldestAt ? ` · ${oldestLabel(q.oldestAt, now)}` : null}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

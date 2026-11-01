import { ArrowDown, ArrowUp } from "lucide-react";
import type { Metadata } from "next";

import { AUDIT_TONE_CLASSES, AuditSummary } from "@/components/admin/audit/audit-summary";
import {
  actorLabel,
  AUDIT_ACTIONS,
  auditActionOptions,
  describeAudit,
  directoryFromAudit,
  isKnownAuditAction,
} from "@/components/admin/audit/describe";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { formatDate, formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { requireAdmin } from "@/server/auth/viewer";
import { listAuditLog, type AuditFeedItem } from "@/server/services/admin/audit";

export const metadata: Metadata = { title: "Audit-Log" };

const PAGE_SIZE = 50;
const DAY_MS = 86_400_000;

const TARGET_LABELS: Record<string, string> = {
  user: "Nutzer",
  creator: "Creator",
  post: "Post",
  report: "Meldung",
  payout: "Auszahlung",
  settings: "Einstellungen",
  subscription: "Abo",
  premium: "Premium",
};

function targetLabel(item: AuditFeedItem): string | null {
  if (!item.targetType) return null;
  const type = TARGET_LABELS[item.targetType] ?? item.targetType;
  if (!item.targetId || item.targetType === "settings") return type;
  return `${type} ${item.targetId.slice(0, 8)}`;
}

function auditHref(params: Record<string, string>): string {
  const s = new URLSearchParams(params).toString();
  return s ? `/admin/audit?${s}` : "/admin/audit";
}

/** Einträge nach Kalendertag (Europe/Zurich) gruppieren – die Liste ist bereits absteigend sortiert. */
function groupByDay(items: AuditFeedItem[]): { day: string; items: AuditFeedItem[] }[] {
  const groups: { day: string; items: AuditFeedItem[] }[] = [];
  for (const item of items) {
    const day = formatDate(item.createdAt);
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const action = typeof sp.action === "string" && isKnownAuditAction(sp.action) ? sp.action : null;
  // Stabiler Cursor vom Server („älter als dieser Eintrag“, auch bei gleichen Zeitstempeln); ungültig → erste Seite.
  const cursor = typeof sp.cursor === "string" && sp.cursor.length <= 80 ? sp.cursor : null;

  // +1 zeigt, ob es ältere Einträge gibt.
  const raw = await listAuditLog(admin, { limit: PAGE_SIZE + 1, cursor: cursor ?? undefined, action: action ?? undefined });
  const items = raw.slice(0, PAGE_SIZE);
  const next = raw.length > PAGE_SIZE ? (items.at(-1)?.cursor ?? null) : null;
  // Handles der Ziele und Creator löst der Server mit auf.
  const directory = directoryFromAudit(items);
  const now = new Date();
  const today = formatDate(now);
  const yesterday = formatDate(new Date(now.getTime() - DAY_MS));
  const filterParams: Record<string, string> = action ? { action } : {};

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Verwaltung · Protokoll"
        title="Audit-Log"
        description="Wer hat wann was getan: Freigaben, Sperren, Auszahlungen, Einstellungen und Abos – neueste zuerst."
      />

      <form action="/admin/audit" className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 flex-1 gap-1.5 sm:w-72 sm:flex-none">
          <label htmlFor="audit-action" className="text-[13px] font-medium text-ink">
            Aktion
          </label>
          <Select id="audit-action" name="action" defaultValue={action ?? ""}>
            <option value="">Alle Aktionen</option>
            {auditActionOptions().map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Filtern
        </Button>
        {action || cursor ? (
          <ButtonLink href="/admin/audit" variant="ghost">
            Zurücksetzen
          </ButtonLink>
        ) : null}
      </form>

      {cursor ? (
        <p className="flex flex-wrap items-center gap-3 text-[13px] text-ink-muted">
          {items[0] ? `Ältere Einträge ab ${formatDateTime(items[0].createdAt)}` : "Ältere Einträge"}
          <ButtonLink href={auditHref(filterParams)} variant="ghost" size="sm">
            <ArrowUp aria-hidden />
            Zu den neuesten
          </ButtonLink>
        </p>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title={cursor ? "Keine älteren Einträge" : action ? `Noch nie: «${AUDIT_ACTIONS[action].label}»` : "Noch keine Einträge"}
          description={
            cursor
              ? "Du bist am Anfang des Protokolls angekommen."
              : action
                ? "Für diese Aktion gibt es bisher keinen Eintrag. Wähle eine andere oder zeig alle."
                : "Sobald jemand freigibt, sperrt oder auszahlt, steht es hier – unveränderlich."
          }
          action={
            action || cursor ? (
              <ButtonLink href="/admin/audit" size="sm">
                Alle Einträge
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-6">
          {groupByDay(items).map((group) => (
            <section key={group.day} aria-labelledby={`day-${group.day}`} className="rounded-card border border-line bg-surface">
              <header className="flex h-11 items-center justify-between gap-3 border-b border-line px-4">
                <h2 id={`day-${group.day}`} className="text-[13px] font-semibold text-ink">
                  {group.day === today ? "Heute" : group.day === yesterday ? "Gestern" : group.day}
                  {group.day === today || group.day === yesterday ? <span className="ml-2 font-mono text-xs font-normal text-ink-faint">{group.day}</span> : null}
                </h2>
                <span className="font-mono text-xs text-ink-faint tabular-nums">
                  {formatNumber(group.items.length)} {group.items.length === 1 ? "Eintrag" : "Einträge"}
                </span>
              </header>
              <ol className="divide-y divide-line">
                {group.items.map((item) => {
                  const d = describeAudit(item, directory);
                  const Icon = d.icon;
                  const target = targetLabel(item);
                  return (
                    <li key={item.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 px-4 py-3 sm:grid-cols-[52px_20px_minmax(0,1fr)_auto]">
                      <time
                        dateTime={item.createdAt.toISOString()}
                        title={formatDateTime(item.createdAt)}
                        className="hidden pt-px font-mono text-xs text-ink-faint tabular-nums sm:block"
                      >
                        {formatDateTime(item.createdAt).split(", ")[1]}
                      </time>
                      <span className="mt-px grid size-5 place-items-center rounded-full border border-line bg-surface-2">
                        <Icon aria-hidden className={cn("size-3", AUDIT_TONE_CLASSES[d.tone])} strokeWidth={2.4} />
                      </span>
                      <div className="min-w-0">
                        <p className="eyebrow mb-1.5">{d.label}</p>
                        <AuditSummary segments={d.summary} className="block text-[13.5px] leading-snug" />
                        {d.detail ? <p className="mt-1 max-w-prose text-[13px] leading-snug whitespace-pre-line text-ink-faint">«{d.detail}»</p> : null}
                        <p className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 font-mono text-[11px] text-ink-faint sm:hidden">
                          <span>{actorLabel(item.actor)}</span>
                          <span>{formatDateTime(item.createdAt)}</span>
                        </p>
                      </div>
                      <div className="hidden min-w-0 text-right sm:block">
                        <p className="font-mono text-xs text-ink-muted">{actorLabel(item.actor)}</p>
                        <p className="mt-1 font-mono text-[11px] text-ink-faint">{formatRelative(item.createdAt, now)}</p>
                        {target ? <p className="mt-1 font-mono text-[11px] text-ink-faint">{target}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}

          {next ? (
            <div className="flex justify-center">
              <ButtonLink href={auditHref({ ...filterParams, cursor: next })} variant="secondary">
                <ArrowDown aria-hidden />
                Ältere laden
              </ButtonLink>
            </div>
          ) : (
            <p className="text-center font-mono text-[11px] text-ink-faint">Anfang des Protokolls</p>
          )}
        </div>
      )}
    </div>
  );
}

import { ChevronLeft, ChevronRight, Search, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { UserRowActions } from "@/components/admin/users/user-row-actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { Segmented } from "@/components/ui/segmented";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/format";
import { requireAdmin } from "@/server/auth/viewer";
import { searchUsers, type AdminUserRow, type UserFilter } from "@/server/services/admin/users";

export const metadata: Metadata = { title: "Nutzer" };

const PAGE_SIZE = 25;
const FILTERS: { value: UserFilter; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "creators", label: "Creator" },
  { value: "admins", label: "Admins" },
  { value: "banned", label: "Gesperrt" },
];

type Query = { q: string; filter: UserFilter; page: number };

function first(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function parseQuery(sp: Record<string, string | string[] | undefined>): Query {
  const filterRaw = first(sp.filter);
  const filter = FILTERS.some((f) => f.value === filterRaw) ? (filterRaw as UserFilter) : "all";
  const page = Number.parseInt(first(sp.page), 10);
  return { q: first(sp.q).trim().slice(0, 64), filter, page: Number.isFinite(page) && page > 1 ? Math.min(page, 10_000) : 1 };
}

function usersHref({ q, filter, page }: Query): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (filter !== "all") params.set("filter", filter);
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `/admin/users?${s}` : "/admin/users";
}

function displayLabel(u: AdminUserRow): string {
  return u.handle ? `@${u.handle}` : (u.displayName ?? u.email ?? "dieses Konto");
}

function RoleCell({ user }: { user: AdminUserRow }) {
  const badges = [];
  if (user.isAdmin) {
    badges.push(
      <Badge key="admin" tone="accent" icon={<ShieldCheck aria-hidden />}>
        Admin
      </Badge>,
    );
  }
  if (user.creator) {
    const { verificationStatus, isPremium } = user.creator;
    if (verificationStatus === "approved") badges.push(<Badge key="creator">Creator</Badge>);
    else if (verificationStatus === "pending") badges.push(<Badge key="creator">Creator · in Prüfung</Badge>);
    else badges.push(<Badge key="creator">Creator · abgelehnt</Badge>);
    if (isPremium) badges.push(<PremiumBadge key="premium" compact />);
  }
  if (badges.length === 0) return <span className="text-[13px] text-ink-faint">Fan</span>;
  return <span className="flex flex-wrap items-center gap-1.5">{badges}</span>;
}

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const admin = await requireAdmin();
  const query = parseQuery(await searchParams);
  const { items, total } = await searchUsers(admin, {
    query: query.q,
    filter: query.filter,
    limit: PAGE_SIZE,
    offset: (query.page - 1) * PAGE_SIZE,
  });
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (query.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, query.page * PAGE_SIZE);
  const filterLabel = FILTERS.find((f) => f.value === query.filter)?.label ?? "Alle";

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Verwaltung · Konten"
        title="Nutzer"
        description="Suche nach Handle, Name oder E-Mail. Sperren braucht immer einen Grund – Admins lassen sich nicht sperren."
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <form role="search" action="/admin/users" className="flex w-full max-w-md gap-2">
          {query.filter !== "all" ? <input type="hidden" name="filter" value={query.filter} /> : null}
          <label htmlFor="user-search" className="sr-only">
            Nutzer suchen
          </label>
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
            <Input
              id="user-search"
              type="search"
              name="q"
              defaultValue={query.q}
              placeholder="@handle, Name oder E-Mail"
              autoComplete="off"
              spellCheck={false}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Suchen
          </Button>
        </form>
        <Segmented
          label="Filter"
          active={usersHref({ ...query, page: 1 })}
          items={FILTERS.map((f) => ({ href: usersHref({ q: query.q, filter: f.value, page: 1 }), label: f.label }))}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={query.page > lastPage && total > 0 ? "Diese Seite gibt es nicht" : query.q ? `Niemand gefunden für «${query.q}»` : "Keine Konten in diesem Filter"}
          description={
            query.q
              ? "Prüfe die Schreibweise oder suche nach einem Teil des Handles, Namens oder der E-Mail-Adresse."
              : `Im Filter «${filterLabel}» gibt es gerade niemanden.`
          }
          action={
            query.q || query.filter !== "all" || query.page > 1 ? (
              <ButtonLink href="/admin/users" size="sm">
                Alle Nutzer zeigen
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <Card
          title={query.q ? `Treffer für «${query.q}»` : filterLabel === "Alle" ? "Alle Konten" : filterLabel}
          action={
            <span className="font-num text-xs text-ink-faint tabular-nums">
              {formatNumber(from)}–{formatNumber(to)} von {formatNumber(total)}
            </span>
          }
          flush
        >
          <Table>
            <THead>
              <TR>
                <TH>Konto</TH>
                <TH className="hidden sm:table-cell">Rolle</TH>
                <TH className="hidden sm:table-cell">Status</TH>
                <TH numeric className="hidden md:table-cell">
                  Abos
                </TH>
                <TH numeric className="hidden md:table-cell">
                  Abonnenten
                </TH>
                <TH className="hidden lg:table-cell">Dabei seit</TH>
                <TH className="text-right">
                  <span className="sr-only">Aktion</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {items.map((u) => {
                const name = u.displayName ?? u.handle ?? "Ohne Profil";
                const isSelf = u.id === admin.id;
                return (
                  <TR key={u.id}>
                    <TD>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={name} size="sm" />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-[13.5px] font-medium">
                            <span className="max-w-[16rem] truncate">{name}</span>
                            {isSelf ? <Badge className="h-[18px] px-1 text-[10.5px]">Du</Badge> : null}
                          </span>
                          <span className="flex max-w-[22rem] gap-2 truncate font-num text-[11px] text-ink-faint">
                            {u.handle ? <span>@{u.handle}</span> : <span>noch kein Handle</span>}
                            {u.email ? <span className="hidden truncate sm:inline">{u.email}</span> : null}
                          </span>
                          {/* Mobil: Rolle & Status hier statt in eigenen Spalten */}
                          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
                            <RoleCell user={u} />
                            {u.status === "banned" ? <Badge tone="danger">Gesperrt</Badge> : null}
                          </span>
                        </span>
                      </span>
                    </TD>
                    <TD className="hidden sm:table-cell">
                      <RoleCell user={u} />
                    </TD>
                    <TD className="hidden sm:table-cell">
                      {u.status === "banned" ? <Badge tone="danger">Gesperrt</Badge> : <span className="text-[13px] text-ink-faint">aktiv</span>}
                    </TD>
                    <TD numeric className="hidden md:table-cell">
                      {formatNumber(u.activeSubscriptions)}
                    </TD>
                    <TD numeric className="hidden md:table-cell">
                      {u.creator ? formatNumber(u.creator.activeSubscribers) : <span className="text-ink-faint">–</span>}
                    </TD>
                    <TD className="hidden font-num text-[13px] text-ink-muted tabular-nums lg:table-cell">{formatDate(u.createdAt)}</TD>
                    <TD className="text-right">
                      <UserRowActions userId={u.id} label={displayLabel(u)} banned={u.status === "banned"} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {lastPage > 1 ? (
            <nav aria-label="Seiten" className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
              <span className="font-num text-xs text-ink-faint tabular-nums">
                Seite {formatNumber(query.page)} von {formatNumber(lastPage)}
              </span>
              <span className="flex gap-2">
                {query.page > 1 ? (
                  <ButtonLink href={usersHref({ ...query, page: query.page - 1 })} size="sm" rel="prev">
                    <ChevronLeft aria-hidden />
                    Zurück
                  </ButtonLink>
                ) : (
                  <span aria-disabled="true" className={buttonClasses({ size: "sm" })}>
                    <ChevronLeft aria-hidden />
                    Zurück
                  </span>
                )}
                {query.page < lastPage ? (
                  <ButtonLink href={usersHref({ ...query, page: query.page + 1 })} size="sm" rel="next">
                    Weiter
                    <ChevronRight aria-hidden />
                  </ButtonLink>
                ) : (
                  <span aria-disabled="true" className={buttonClasses({ size: "sm" })}>
                    Weiter
                    <ChevronRight aria-hidden />
                  </span>
                )}
              </span>
            </nav>
          ) : null}
        </Card>
      )}
    </div>
  );
}

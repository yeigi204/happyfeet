import "server-only";

import { and, asc, count, desc, eq, gt, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { normalizeHandle } from "@/lib/domain/handles";
import type { UserStatus, VerificationStatus, Viewer } from "@/lib/domain/types";
import { assertAdmin } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { creatorProfiles, premiumSubscriptions, subscriptions, users } from "@/server/db/schema";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { cancelAtProviders, stopBillingForUser } from "@/server/services/account-billing";
import { writeAudit } from "@/server/services/audit";

export type AdminUserRow = {
  id: string;
  handle: string | null;
  displayName: string | null;
  email: string | null;
  createdAt: Date;
  status: UserStatus;
  /** Konto in Clerk gelöscht (anonymisiert, Daten bleiben als Nachweis); sonst `null`. */
  deletedAt: Date | null;
  isAdmin: boolean;
  creator: { verificationStatus: VerificationStatus; isPremium: boolean; activeSubscribers: number } | null;
  /** Abos dieses Nutzers als Fan mit laufendem Zugriff. */
  activeSubscriptions: number;
};

export type UserFilter = "all" | "creators" | "admins" | "banned";

type Opts = { now?: Date };

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const QUICK_SEARCH_LIMIT = 8;
const QUERY_MAX_LENGTH = 64;
const REASON_MAX_LENGTH = 500;
const USER_NOT_FOUND = "Dieser Nutzer existiert nicht.";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `\`, `%` und `_` sind in LIKE-Mustern Sonderzeichen. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Steuerzeichen (u. a. NUL, das Postgres in Text ablehnt) haben in einer Suche nichts verloren. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

function normalizeQuery(query: unknown): string {
  if (typeof query !== "string") return "";
  return query.replace(CONTROL_CHARS, "").trim().replace(/^@/, "").slice(0, QUERY_MAX_LENGTH).trim();
}

function matchCondition(query: string): SQL | undefined {
  if (!query) return undefined;
  const pattern = `%${escapeLike(query)}%`;
  return or(ilike(users.handle, pattern), ilike(users.displayName, pattern), ilike(users.email, pattern));
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const n = Math.trunc(value ?? fallback);
  return Number.isFinite(n) && n >= min ? Math.min(n, max) : fallback;
}

/** Fan-Abos mit laufendem Zugriff (`active|canceled`, Periode läuft noch). */
function liveSubscription(now: Date): SQL {
  return and(inArray(subscriptions.status, ["active", "canceled"]), gt(subscriptions.currentPeriodEnd, now))!;
}

function parseReason(reason: unknown): string {
  const value = typeof reason === "string" ? reason.replaceAll("\u0000", "").trim() : "";
  if (value.length === 0) {
    throw new ValidationError("Bitte gib einen Grund für die Sperre an.", { reason: ["Ein Grund ist Pflicht."] });
  }
  if (value.length > REASON_MAX_LENGTH) {
    throw new ValidationError("Der Grund ist zu lang.", { reason: [`Höchstens ${REASON_MAX_LENGTH} Zeichen.`] });
  }
  return value;
}

/**
 * Nutzerliste für den Admin: Suche in Handle, Anzeigename und E-Mail (ohne Gross-/Kleinschreibung,
 * `%`/`_` wörtlich), Filter, Paginierung. Neueste zuerst.
 */
export async function searchUsers(
  admin: Viewer,
  input: { query?: string; filter?: UserFilter; limit?: number; offset?: number } = {},
  opts: Opts = {},
): Promise<{ items: AdminUserRow[]; total: number }> {
  assertAdmin(admin);
  const now = opts.now ?? new Date();
  const limit = clampInt(input.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(input.offset, 0, 0, Number.MAX_SAFE_INTEGER);

  const conditions: (SQL | undefined)[] = [matchCondition(normalizeQuery(input.query))];
  if (input.filter === "creators") {
    conditions.push(sql`exists (select 1 from ${creatorProfiles} where ${creatorProfiles.userId} = ${users.id})`);
  } else if (input.filter === "admins") {
    conditions.push(eq(users.isAdmin, true));
  } else if (input.filter === "banned") {
    conditions.push(eq(users.status, "banned"));
  }
  const where = and(...conditions);
  const db = getDb();

  const [{ total }] = await db.select({ total: count() }).from(users).where(where);

  const isPremium = sql<boolean>`exists (select 1 from ${premiumSubscriptions} where ${and(
    eq(premiumSubscriptions.creatorId, users.id),
    inArray(premiumSubscriptions.status, ["active", "canceled"]),
    gt(premiumSubscriptions.currentPeriodEnd, now),
  )})`;
  const rows = await db
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      email: users.email,
      createdAt: users.createdAt,
      status: users.status,
      deletedAt: users.deletedAt,
      isAdmin: users.isAdmin,
      verificationStatus: creatorProfiles.verificationStatus,
      isPremium,
      activeSubscribers: sql<number>`(select count(*)::int from ${subscriptions} where ${and(
        eq(subscriptions.creatorId, users.id),
        liveSubscription(now),
      )})`,
      activeSubscriptions: sql<number>`(select count(*)::int from ${subscriptions} where ${and(
        eq(subscriptions.fanId, users.id),
        liveSubscription(now),
      )})`,
    })
    .from(users)
    .leftJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
    .where(where)
    .orderBy(desc(users.createdAt), asc(users.id))
    .limit(limit)
    .offset(offset);

  return {
    total: Number(total),
    items: rows.map((row) => ({
      id: row.id,
      handle: row.handle,
      displayName: row.displayName,
      email: row.email,
      createdAt: row.createdAt,
      status: row.status,
      deletedAt: row.deletedAt,
      isAdmin: row.isAdmin,
      creator: row.verificationStatus
        ? {
            verificationStatus: row.verificationStatus,
            isPremium: Boolean(row.isPremium),
            activeSubscribers: Number(row.activeSubscribers),
          }
        : null,
      activeSubscriptions: Number(row.activeSubscriptions),
    })),
  };
}

/**
 * Sperrt einen Nutzer (Grund Pflicht). Sich selbst und andere Admins kann niemand sperren
 * (`ForbiddenError`) – Admin-Rechte werden per Skript vergeben und entzogen.
 */
export async function banUser(admin: Viewer, userId: string, reason: string, opts: Opts = {}): Promise<void> {
  assertAdmin(admin);
  if (!UUID_PATTERN.test(userId)) throw new NotFoundError(USER_NOT_FOUND);
  if (userId === admin.id) throw new ForbiddenError("Du kannst dich nicht selbst sperren.");
  const parsedReason = parseReason(reason);
  const now = opts.now ?? new Date();

  const toCancelAtProvider = await getDb().transaction(async (tx) => {
    const [target] = await tx
      .select({ id: users.id, isAdmin: users.isAdmin, status: users.status, handle: users.handle })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .for("update");
    if (!target) throw new NotFoundError(USER_NOT_FOUND);
    if (target.isAdmin) throw new ForbiddenError("Admins können nicht gesperrt werden.");
    if (target.status === "banned") throw new ConflictError("Dieser Nutzer ist bereits gesperrt.");

    await tx
      .update(users)
      .set({ status: "banned", bannedReason: parsedReason, bannedAt: now, updatedAt: now })
      .where(eq(users.id, userId));

    // Keine weiteren Abbuchungen (Abos als Fan und Creator, offene Checkouts, Premium).
    const stopped = await stopBillingForUser(tx, userId, now);

    await writeAudit(
      {
        actorId: admin.id,
        action: "user.banned",
        targetType: "user",
        targetId: userId,
        metadata: {
          reason: parsedReason,
          handle: target.handle,
          canceledSubscriptions: stopped.canceledSubscriptions,
          canceledPremium: stopped.canceledPremium,
        },
      },
      tx,
    );
    return stopped.refs;
  });

  // Erst nach dem Commit beim Provider kündigen.
  await cancelAtProviders(toCancelAtProvider, "admin");
}

/** Hebt eine Sperre auf. */
export async function unbanUser(admin: Viewer, userId: string, opts: Opts = {}): Promise<void> {
  assertAdmin(admin);
  if (!UUID_PATTERN.test(userId)) throw new NotFoundError(USER_NOT_FOUND);
  const now = opts.now ?? new Date();

  await getDb().transaction(async (tx) => {
    const [target] = await tx
      .select({ id: users.id, status: users.status, handle: users.handle, reason: users.bannedReason })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .for("update");
    if (!target) throw new NotFoundError(USER_NOT_FOUND);
    if (target.status !== "banned") throw new ConflictError("Dieser Nutzer ist nicht gesperrt.");

    await tx
      .update(users)
      .set({ status: "active", bannedReason: null, bannedAt: null, updatedAt: now })
      .where(eq(users.id, userId));
    await writeAudit(
      {
        actorId: admin.id,
        action: "user.unbanned",
        targetType: "user",
        targetId: userId,
        metadata: { previousReason: target.reason, handle: target.handle },
      },
      tx,
    );
  });
}

/**
 * Schnellsuche für die ⌘K-Palette (max. 8 Treffer): Handle-Treffer (exakt, dann Präfix) zuerst.
 * `href` führt auf die gefilterte Nutzerliste.
 */
export async function quickSearch(
  admin: Viewer,
  q: string,
): Promise<{ id: string; label: string; sublabel?: string; href: string }[]> {
  assertAdmin(admin);
  const query = normalizeQuery(q);
  if (!query) return [];
  const handleQuery = normalizeHandle(query);
  const prefix = `${escapeLike(query)}%`;

  const rows = await getDb()
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      email: users.email,
      status: users.status,
      deletedAt: users.deletedAt,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(matchCondition(query))
    .orderBy(
      sql`case when ${users.handle} = ${handleQuery} then 0
               when ${users.handle} ilike ${prefix} then 1
               when ${users.displayName} ilike ${prefix} then 2
               else 3 end`,
      desc(users.createdAt),
      asc(users.id),
    )
    .limit(QUICK_SEARCH_LIMIT);

  return rows.map((row) => {
    const parts = [
      row.handle ? `@${row.handle}` : null,
      row.email,
      row.isAdmin ? "Admin" : null,
      row.status === "banned" ? "gesperrt" : null,
      row.deletedAt ? "gelöscht" : null,
    ].filter((part): part is string => Boolean(part));
    return {
      id: row.id,
      label: row.displayName ?? row.handle ?? row.email ?? row.id,
      ...(parts.length > 0 ? { sublabel: parts.join(" · ") } : {}),
      href: `/admin/users?q=${encodeURIComponent(row.handle ?? row.email ?? row.id)}`,
    };
  });
}

import "server-only";

import { cache } from "react";

import type { UserDirectory } from "@/components/admin/audit/describe";
import type { Viewer } from "@/lib/domain/types";
import { getAdminDashboard } from "@/server/services/admin/dashboard";
import { searchUsers } from "@/server/services/admin/users";

/**
 * Dashboard-Daten einmal pro Request: Layout (Zähler, Ticker) und Dashboard-Seite teilen sich das
 * Ergebnis (`getViewer` ist ebenfalls pro Request gecacht → gleicher Schlüssel).
 */
export const loadAdminDashboard = cache((admin: Viewer) => getAdminDashboard(admin));

/**
 * Handles für Audit-Ziele (Creator-IDs in Metadaten, Admins als Ziel). Audit-Einträge enthalten nur IDs;
 * Creator und Admins sind überschaubar – Fans tauchen als Akteure mit Handle bereits im Feed auf.
 */
export const loadUserDirectory = cache(async (admin: Viewer): Promise<UserDirectory> => {
  const [creators, admins] = await Promise.all([
    searchUsers(admin, { filter: "creators", limit: 200 }),
    searchUsers(admin, { filter: "admins", limit: 50 }),
  ]);
  return new Map([...creators.items, ...admins.items].map((u) => [u.id, { handle: u.handle, displayName: u.displayName }]));
});

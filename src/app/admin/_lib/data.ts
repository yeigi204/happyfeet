import "server-only";

import { cache } from "react";

import type { Viewer } from "@/lib/domain/types";
import { getAdminDashboard } from "@/server/services/admin/dashboard";

/**
 * Dashboard-Daten einmal pro Request: Layout (Zähler) und Dashboard-Seite teilen sich das
 * Ergebnis (`getViewer` ist ebenfalls pro Request gecacht → gleicher Schlüssel).
 */
export const loadAdminDashboard = cache((admin: Viewer) => getAdminDashboard(admin));

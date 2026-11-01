"use server";

import { getViewer } from "@/server/auth/viewer";
import { AppError } from "@/server/errors";
import { quickSearch } from "@/server/services/admin/users";

export type QuickSearchHit = { id: string; label: string; sublabel?: string; href: string };

/** Nutzersuche der ⌘K-Palette. Nicht-Admins bekommen eine leere Liste (der Service prüft selbst). */
export async function quickSearchAction(q: string): Promise<QuickSearchHit[]> {
  const viewer = await getViewer();
  if (!viewer) return [];
  try {
    return await quickSearch(viewer, typeof q === "string" ? q : "");
  } catch (error) {
    if (error instanceof AppError) return [];
    throw error;
  }
}

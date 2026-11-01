import "server-only";

import { revalidatePath } from "next/cache";

import type { Viewer } from "@/lib/domain/types";
import { toActionResult, type ActionResult } from "@/server/action-result";
import { assertAdmin } from "@/server/auth/guards";
import { getViewer } from "@/server/auth/viewer";

/**
 * Gemeinsamer Rahmen aller Admin-Server-Actions: Identität serverseitig neu ermitteln (nie aus dem
 * Client übernehmen), Admin prüfen, Use-Case ausführen, Fehler in ein `ActionResult` übersetzen und
 * danach den ganzen Admin-Bereich neu rendern lassen (Zähler in Navigation & Ticker inklusive).
 * Die Services prüfen `assertAdmin` zusätzlich selbst.
 */
export async function runAdminAction<T>(fn: (admin: Viewer) => Promise<T>): Promise<ActionResult<T>> {
  const result = await toActionResult(async () => {
    const viewer = await getViewer();
    assertAdmin(viewer);
    return fn(viewer);
  });
  // Auch bei Fehlern (z. B. „wurde gerade schon geprüft“) frische Daten holen.
  revalidatePath("/admin", "layout");
  return result;
}

/** Text-Feld aus FormData bzw. einem Argument – alles andere wird zu "". */
export function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

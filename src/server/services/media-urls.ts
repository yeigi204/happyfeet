import "server-only";

import type { PostMedia } from "@/server/db/schema";
import { signMediaUrls } from "@/server/storage";

/**
 * Ein Bild eines Posts, wie es die UI bekommt. `width`/`height` sind die Masse des Originals
 * (die Vorschau hat dasselbe Seitenverhältnis) – für Platzhalter und Layout ohne Springen.
 */
export type MediaView = { id: string; url: string; width: number; height: number; isPreview: boolean };

type SignableMedia = Pick<PostMedia, "id" | "position" | "originalKey" | "previewKey" | "width" | "height">;

/**
 * Die **einzige** Stelle, die URLs für Post-Medien signiert.
 * Gesperrt (`locked`) wird ausschliesslich der `preview_key` signiert – der `original_key`
 * verlässt den Server dann nicht, auch nicht als Teil einer URL.
 */
export async function mediaViewsFor(rows: SignableMedia[], locked: boolean): Promise<MediaView[]> {
  const [views] = await mediaViewsForPosts([{ rows, locked }]);
  return views;
}

/** Wie `mediaViewsFor`, aber für viele Posts mit einer einzigen (Batch-)Signierung. */
export async function mediaViewsForPosts(
  groups: ReadonlyArray<{ rows: SignableMedia[]; locked: boolean }>,
): Promise<MediaView[][]> {
  const sorted = groups.map(({ rows, locked }) => ({
    locked,
    rows: [...rows].sort((a, b) => a.position - b.position),
  }));
  const keyOf = (row: SignableMedia, locked: boolean) => (locked ? row.previewKey : row.originalKey);

  const urls = await signMediaUrls(sorted.flatMap(({ rows, locked }) => rows.map((row) => keyOf(row, locked))));

  return sorted.map(({ rows, locked }) =>
    rows.map((row) => {
      const url = urls.get(keyOf(row, locked));
      if (!url) throw new Error(`Medien-URL für ${row.id} konnte nicht signiert werden.`);
      return { id: row.id, url, width: row.width, height: row.height, isPreview: locked };
    }),
  );
}

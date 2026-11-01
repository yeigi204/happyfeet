/**
 * Blättern im Audit-Log über `?before=<ISO>&skip=<ids>`.
 *
 * `listAuditLog` blättert mit `created_at < before`. Postgres speichert Mikrosekunden, JavaScript nur
 * Millisekunden – und mehrere Einträge können im selben Moment entstehen. Ein naiver Cursor auf den
 * letzten Zeitstempel würde Einträge mit gleicher Millisekunde überspringen. Deshalb zeigt der Cursor
 * eine Millisekunde *hinter* den letzten Eintrag und nennt die bereits gezeigten IDs dieser
 * Millisekunde, die beim Laden wieder herausgefiltert werden.
 */

export type AuditCursor = { before: Date; skip: string[] };

const MAX_SKIP = 50;
const ID_PATTERN = /^[0-9a-f-]{36}$/i;

export function parseAuditCursor(before: unknown, skip: unknown): AuditCursor | null {
  if (typeof before !== "string" || before.length > 40) return null;
  const date = new Date(before);
  if (Number.isNaN(date.getTime())) return null;
  const ids =
    typeof skip === "string" && skip.length > 0
      ? skip
          .split(",")
          .filter((id) => ID_PATTERN.test(id))
          .slice(0, MAX_SKIP)
      : [];
  return { before: date, skip: ids };
}

/** Cursor für die nächste (ältere) Seite – aus den Einträgen der aktuellen Seite. */
export function nextAuditCursor(items: readonly { id: string; createdAt: Date }[]): AuditCursor | null {
  const last = items.at(-1);
  if (!last) return null;
  const lastMs = last.createdAt.getTime();
  const skip = items
    .filter((item) => item.createdAt.getTime() === lastMs)
    .map((item) => item.id)
    .slice(-MAX_SKIP);
  return { before: new Date(lastMs + 1), skip };
}

export function auditCursorParams(cursor: AuditCursor): Record<string, string> {
  return cursor.skip.length > 0
    ? { before: cursor.before.toISOString(), skip: cursor.skip.join(",") }
    : { before: cursor.before.toISOString() };
}

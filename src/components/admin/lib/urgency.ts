/** Dringlichkeit einer Warteschlange nach dem Alter ihres ältesten Eintrags. */
export type Urgency = "ok" | "due" | "overdue";

const HOUR_MS = 60 * 60 * 1000;
/** Ab 24 h wartet etwas zu lange („Dringend“). */
export const DUE_AFTER_MS = 24 * HOUR_MS;
/** Ab 72 h ist es überfällig („Überfällig“). */
export const OVERDUE_AFTER_MS = 72 * HOUR_MS;

export const URGENCY_LABELS: Record<Urgency, string> = {
  ok: "Im Rahmen",
  due: "Dringend",
  overdue: "Überfällig",
};

/** `null`, wenn nichts wartet (kein ältester Eintrag). */
export function urgencyFor(oldestAt: Date | null | undefined, now: Date): Urgency | null {
  if (!oldestAt || Number.isNaN(oldestAt.getTime())) return null;
  const age = now.getTime() - oldestAt.getTime();
  if (age >= OVERDUE_AFTER_MS) return "overdue";
  if (age >= DUE_AFTER_MS) return "due";
  return "ok";
}

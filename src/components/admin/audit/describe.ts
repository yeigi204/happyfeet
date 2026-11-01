import {
  Ban,
  BadgeCheck,
  Check,
  CircleSlash,
  CreditCard,
  Flag,
  FlagOff,
  Gem,
  Settings2,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

import { REPORT_REASONS } from "@/lib/domain/reports";
import type { ReportReason } from "@/lib/domain/types";
import { formatChf, formatNumber, formatPercentBps } from "@/lib/format";
import type { AuditAction } from "@/server/services/audit";

/**
 * Deutsche Beschriftung für jeden Audit-Eintrag (Aktivitäts-Feed im Dashboard, Audit-Log).
 * Rein und testbar: liefert Text-Segmente statt JSX; `<b>`-Hervorhebung macht `AuditSummary`.
 */

export type AuditTone = "neutral" | "success" | "danger" | "accent";

/** Text-Segment: einfacher Text oder hervorgehobener Name (Handle, Betrag). */
export type AuditSegment = string | { strong: string };

export type AuditDescription = {
  label: string;
  icon: LucideIcon;
  tone: AuditTone;
  summary: AuditSegment[];
  /** Notiz/Grund in Klartext, falls vorhanden. */
  detail: string | null;
};

/** Minimal benötigte Felder eines `AuditFeedItem` (Service-Typ bleibt serverseitig). */
export type AuditEntry = {
  action: string;
  actor: { id: string; handle: string | null; displayName: string | null } | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
};

export type UserDirectory = ReadonlyMap<string, { handle: string | null; displayName: string | null }>;

type ActionMeta = { label: string; icon: LucideIcon; tone: AuditTone };

export const AUDIT_ACTIONS = {
  "subscription.activated": { label: "Abo abgeschlossen", icon: CreditCard, tone: "success" },
  "subscription.canceled": { label: "Abo gekündigt", icon: CircleSlash, tone: "neutral" },
  "premium.activated": { label: "Premium gebucht", icon: Gem, tone: "success" },
  "premium.canceled": { label: "Premium gekündigt", icon: Gem, tone: "neutral" },
  "payouts.generated": { label: "Auszahlungen erzeugt", icon: Wallet, tone: "neutral" },
  "payout.paid": { label: "Auszahlung bezahlt", icon: Wallet, tone: "success" },
  "creator.applied": { label: "Creator-Bewerbung", icon: UserPlus, tone: "neutral" },
  "creator.approved": { label: "Creator freigegeben", icon: BadgeCheck, tone: "success" },
  "creator.rejected": { label: "Creator abgelehnt", icon: UserX, tone: "danger" },
  "post.approved": { label: "Post freigegeben", icon: Check, tone: "success" },
  "post.rejected": { label: "Post abgelehnt", icon: X, tone: "danger" },
  "post.removed": { label: "Post entfernt", icon: Trash2, tone: "danger" },
  "report.resolved": { label: "Meldung erledigt", icon: Flag, tone: "accent" },
  "report.dismissed": { label: "Meldung verworfen", icon: FlagOff, tone: "accent" },
  "user.banned": { label: "Nutzer gesperrt", icon: Ban, tone: "danger" },
  "user.unbanned": { label: "Sperre aufgehoben", icon: UserCheck, tone: "success" },
  "user.admin_granted": { label: "Admin-Recht vergeben", icon: ShieldCheck, tone: "neutral" },
  "settings.updated": { label: "Einstellungen geändert", icon: Settings2, tone: "neutral" },
} as const satisfies Record<AuditAction, ActionMeta>;

export type KnownAuditAction = keyof typeof AUDIT_ACTIONS;

export function isKnownAuditAction(action: string): action is KnownAuditAction {
  return Object.hasOwn(AUDIT_ACTIONS, action);
}

/** Für Filter: alle bekannten Aktionen mit Beschriftung, alphabetisch nach Label. */
export function auditActionOptions(): { value: KnownAuditAction; label: string }[] {
  return (Object.keys(AUDIT_ACTIONS) as KnownAuditAction[])
    .map((value) => ({ value, label: AUDIT_ACTIONS[value].label }))
    .sort((a, b) => a.label.localeCompare(b.label, "de-CH"));
}

const SETTINGS_LABELS: Record<string, { label: string; format: (v: number) => string }> = {
  standardFeeBps: { label: "Standard-Provision", format: formatPercentBps },
  premiumFeeBps: { label: "Premium-Provision", format: formatPercentBps },
  premiumPriceRappen: { label: "Premium-Preis", format: (v) => formatChf(v) },
  minPriceRappen: { label: "Mindestpreis", format: (v) => formatChf(v) },
  maxPriceRappen: { label: "Höchstpreis", format: (v) => formatChf(v) },
  premoderationCount: { label: "Vorab-Prüfung", format: (v) => (v === 1 ? "1 Post" : `${formatNumber(v)} Posts`) },
};

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const int = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function handleFor(id: string | null, directory: UserDirectory): string | null {
  if (!id) return null;
  return directory.get(id)?.handle ?? null;
}

function who(handle: string | null, fallback: string): AuditSegment {
  return handle ? { strong: `@${handle}` } : fallback;
}

function reasonLabel(value: unknown): string | null {
  const reason = str(value);
  if (!reason) return null;
  return Object.hasOwn(REPORT_REASONS, reason) ? REPORT_REASONS[reason as ReportReason].label : reason;
}

function settingsChanges(metadata: Record<string, unknown>): AuditSegment[] {
  const before = (metadata.before ?? {}) as Record<string, unknown>;
  const after = (metadata.after ?? {}) as Record<string, unknown>;
  const keys = Array.isArray(metadata.changed)
    ? metadata.changed.filter((k): k is string => typeof k === "string")
    : Object.keys(after);
  const parts = keys.flatMap((key) => {
    const meta = SETTINGS_LABELS[key];
    const from = int(before[key]);
    const to = int(after[key]);
    if (!meta || to === null) return [];
    return [from === null ? `${meta.label} auf ${meta.format(to)}` : `${meta.label} von ${meta.format(from)} auf ${meta.format(to)}`];
  });
  return parts.length > 0 ? [parts.join(" · ")] : ["Plattform-Einstellungen angepasst"];
}

/** Beschreibt einen Audit-Eintrag auf Deutsch. Unbekannte Aktionen bleiben lesbar (technischer Name). */
export function describeAudit(entry: AuditEntry, directory: UserDirectory = new Map()): AuditDescription {
  const m = entry.metadata ?? {};
  const actorHandle = entry.actor?.handle ?? null;
  const creatorHandle = handleFor(str(m.creatorId), directory);
  const targetHandle = str(m.handle) ?? handleFor(entry.targetId, directory);
  const note = str(m.note);

  if (!isKnownAuditAction(entry.action)) {
    return { label: entry.action, icon: Settings2, tone: "neutral", summary: [entry.action], detail: note };
  }
  const meta: ActionMeta = AUDIT_ACTIONS[entry.action];
  const base = { label: meta.label, icon: meta.icon, tone: meta.tone };
  const gross = int(m.grossRappen);
  const amountSuffix = (rappen: number | null): AuditSegment[] => (rappen !== null ? [" · ", { strong: formatChf(rappen) }] : []);

  switch (entry.action) {
    case "subscription.activated":
      return {
        ...base,
        summary: [who(actorHandle, "Ein Fan"), " hat ", who(creatorHandle, "einen Creator"), " abonniert", ...amountSuffix(gross)],
        detail: null,
      };
    case "subscription.canceled":
      return {
        ...base,
        summary:
          str(m.source) === "provider"
            ? ["Abo bei ", who(creatorHandle, "einem Creator"), " vom Zahlungsanbieter beendet"]
            : [who(actorHandle, "Ein Fan"), " hat das Abo bei ", who(creatorHandle, "einem Creator"), " gekündigt"],
        detail: null,
      };
    case "premium.activated":
      return { ...base, summary: [who(actorHandle ?? creatorHandle, "Ein Creator"), " hat Premium gebucht", ...amountSuffix(gross)], detail: null };
    case "premium.canceled":
      return {
        ...base,
        summary:
          str(m.source) === "provider"
            ? ["Premium von ", who(creatorHandle, "einem Creator"), " vom Zahlungsanbieter beendet"]
            : [who(creatorHandle ?? actorHandle, "Ein Creator"), " hat Premium gekündigt"],
        detail: null,
      };
    case "payouts.generated": {
      const created = int(m.created) ?? 0;
      return {
        ...base,
        summary:
          created === 0
            ? ["Keine fälligen Auszahlungen"]
            : [created === 1 ? "1 Auszahlung erzeugt" : `${formatNumber(created)} Auszahlungen erzeugt`, ...amountSuffix(int(m.totalRappen))],
        detail: null,
      };
    }
    case "payout.paid": {
      const amount = int(m.amountRappen);
      return {
        ...base,
        summary: ["Auszahlung ", ...(amount !== null ? [{ strong: formatChf(amount) }, " "] : []), "an ", who(creatorHandle, "einen Creator"), " bezahlt"],
        detail: null,
      };
    }
    case "creator.applied": {
      const price = int(m.monthlyPriceRappen);
      return {
        ...base,
        summary: [
          who(targetHandle ?? actorHandle, "Jemand"),
          m.reapplied === true ? " hat sich erneut als Creator beworben" : " hat sich als Creator beworben",
          ...(price !== null ? [` · ${formatChf(price)}/Monat`] : []),
        ],
        detail: null,
      };
    }
    case "creator.approved":
      return { ...base, summary: [who(targetHandle, "Ein Creator"), " als Creator freigegeben"], detail: note };
    case "creator.rejected":
      return { ...base, summary: ["Bewerbung von ", who(targetHandle, "einem Creator"), " abgelehnt"], detail: note };
    case "post.approved":
      return { ...base, summary: ["Post von ", who(creatorHandle, "einem Creator"), " freigegeben"], detail: note };
    case "post.rejected":
      return { ...base, summary: ["Post von ", who(creatorHandle, "einem Creator"), " abgelehnt"], detail: note };
    case "post.removed": {
      const resolved = int(m.resolvedReports) ?? 0;
      return {
        ...base,
        summary: [
          "Post von ",
          who(creatorHandle, "einem Creator"),
          " entfernt",
          ...(resolved > 0 ? [resolved === 1 ? " · 1 Meldung erledigt" : ` · ${formatNumber(resolved)} Meldungen erledigt`] : []),
        ],
        detail: note,
      };
    }
    case "report.resolved":
    case "report.dismissed": {
      const reason = reasonLabel(m.reason);
      const verb = entry.action === "report.resolved" ? " als berechtigt erledigt" : " verworfen";
      return { ...base, summary: [reason ? `Meldung «${reason}»` : "Meldung", verb], detail: note };
    }
    case "user.banned": {
      const canceled = int(m.canceledSubscriptions) ?? 0;
      return {
        ...base,
        summary: [
          who(targetHandle, "Ein Nutzer"),
          " gesperrt",
          ...(canceled > 0 ? [canceled === 1 ? " · 1 Abo gekündigt" : ` · ${formatNumber(canceled)} Abos gekündigt`] : []),
        ],
        detail: str(m.reason),
      };
    }
    case "user.unbanned":
      return { ...base, summary: ["Sperre von ", who(targetHandle, "einem Nutzer"), " aufgehoben"], detail: null };
    case "user.admin_granted":
      return { ...base, summary: [who(targetHandle, "Ein Nutzer"), " hat Admin-Rechte erhalten"], detail: null };
    case "settings.updated":
      return { ...base, summary: settingsChanges(m), detail: null };
  }
}

/** Klartext (Tests, `title`-Attribute, Screenreader). */
export function auditText(segments: readonly AuditSegment[]): string {
  return segments.map((s) => (typeof s === "string" ? s : s.strong)).join("");
}

/** Akteur als Kurztext: „@hf_mara“ bzw. „System“. */
export function actorLabel(actor: AuditEntry["actor"]): string {
  if (!actor) return "System";
  return actor.handle ? `@${actor.handle}` : (actor.displayName ?? "Unbekannt");
}

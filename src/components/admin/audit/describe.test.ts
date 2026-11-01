import { describe, expect, it } from "vitest";

import { actorLabel, AUDIT_ACTIONS, auditActionOptions, auditText, describeAudit, directoryFromAudit, type AuditEntry } from "./describe";

const NBSP = " ";
const CREATOR = "7c193063-135e-49cd-935c-3e48aa156273";
const directory = new Map([[CREATOR, { handle: "zehenspiel", displayName: "Mira Keller" }]]);
const admin = { id: "a", handle: "hf_mara", displayName: "Mara" };

function entry(action: string, metadata: Record<string, unknown> = {}, extra: Partial<AuditEntry> = {}): AuditEntry {
  return { action, actor: admin, targetType: null, targetId: null, metadata, ...extra };
}

const text = (e: AuditEntry) => auditText(describeAudit(e, directory).summary);

describe("describeAudit", () => {
  it("beschriftet jede bekannte Aktion deutsch und ohne scharfes S", () => {
    for (const [action, meta] of Object.entries(AUDIT_ACTIONS)) {
      const d = describeAudit(entry(action), directory);
      expect(d.label).toBe(meta.label);
      expect(auditText(d.summary).length).toBeGreaterThan(3);
      expect(auditText(d.summary) + d.label).not.toMatch(/ß/);
    }
    expect(auditActionOptions()).toHaveLength(Object.keys(AUDIT_ACTIONS).length);
  });

  it("löst Creator-IDs über das Verzeichnis auf", () => {
    expect(text(entry("post.approved", { creatorId: CREATOR }))).toBe("Post von @zehenspiel freigegeben");
    expect(text(entry("payout.paid", { creatorId: CREATOR, amountRappen: 9905 }))).toBe(`Auszahlung CHF${NBSP}99.05 an @zehenspiel bezahlt`);
    expect(text(entry("creator.approved", {}, { targetType: "creator", targetId: CREATOR }))).toBe("@zehenspiel als Creator freigegeben");
  });

  it("nutzt Akteur und Metadaten sinnvoll", () => {
    const fan = { id: "f", handle: "luca_m", displayName: "Luca" };
    expect(text(entry("subscription.activated", { creatorId: CREATOR, grossRappen: 990 }, { actor: fan }))).toBe(
      `@luca_m hat @zehenspiel abonniert · CHF${NBSP}9.90`,
    );
    expect(text(entry("user.banned", { handle: "reto_buehler", reason: "Spam", canceledSubscriptions: 2 }))).toBe(
      "@reto_buehler gesperrt · 2 Abos gekündigt",
    );
    expect(describeAudit(entry("user.banned", { handle: "x", reason: "Spam" })).detail).toBe("Spam");
    expect(text(entry("report.dismissed", { reason: "spam", note: "Kein Spam" }))).toBe("Meldung «Spam» verworfen");
    expect(text(entry("payouts.generated", { created: 4, totalRappen: 62320 }))).toBe(`4 Auszahlungen erzeugt · CHF${NBSP}623.20`);
    expect(text(entry("payouts.generated", { created: 0, totalRappen: 0 }))).toBe("Keine fälligen Auszahlungen");
  });

  it("beschreibt Einstellungs-Änderungen mit Vorher/Nachher", () => {
    expect(
      text(
        entry("settings.updated", {
          before: { premoderationCount: 3, standardFeeBps: 1500 },
          after: { premoderationCount: 5, standardFeeBps: 1250 },
          changed: ["premoderationCount", "standardFeeBps"],
        }),
      ),
    ).toBe(`Vorab-Prüfung von 3 Posts auf 5 Posts · Standard-Provision von 15${NBSP}% auf 12.5${NBSP}%`);
  });

  it("bleibt bei fehlenden Daten und unbekannten Aktionen lesbar", () => {
    expect(text(entry("post.removed", { resolvedReports: 1 }))).toBe("Post von einem Creator entfernt · 1 Meldung erledigt");
    expect(text(entry("something.new"))).toBe("something.new");
    expect(actorLabel(null)).toBe("System");
    expect(actorLabel(admin)).toBe("@hf_mara");
  });
});

describe("directoryFromAudit", () => {
  it("collects server-resolved targets and creators so handles render without a user list", () => {
    const target = { id: "u1", handle: "lena_barfuss", displayName: "Lena" };
    const creator = { id: CREATOR, handle: "zehenspiel", displayName: "Mira Keller" };
    const dir = directoryFromAudit([{ target, creator: null }, { target: null, creator }, {}]);
    expect(dir.get("u1")).toEqual({ handle: "lena_barfuss", displayName: "Lena" });
    expect(dir.get(CREATOR)?.handle).toBe("zehenspiel");
    expect(dir.size).toBe(2);
  });
});

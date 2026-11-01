"use client";

import { Check, ChevronDown, ChevronUp, FlagOff, ShieldCheck, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";

import {
  approvePostAction,
  dismissReportAction,
  rejectPostAction,
  removePostAction,
  resolveReportAction,
} from "@/app/admin/moderation/actions";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { formatNumber } from "@/lib/format";
import type { ActionResult } from "@/server/errors";

import { ActionDialog, type ActionDialogProps } from "../action-dialog";
import { resolveShortcut, type ShortcutState } from "../shell/shortcuts";
import { toast, type ToastInput } from "../toast";
import { TriageList, triageItemId } from "./triage-list";
import { TriageStage } from "./triage-stage";
import type { TriageItem, TriageMode } from "./types";

export type ModerationTriageProps = {
  mode: TriageMode;
  items: TriageItem[];
  /** Server-Zeit (ms) – relative Zeiten rendern auf Server und Client gleich. */
  now: number;
  premoderationCount: number;
  /** Wird gezeigt, sobald alles erledigt ist (auch optimistisch). */
  empty: ReactNode;
};

type Decision = "a" | "r" | "x";
type DialogState = { decision: Exclude<Decision, "a">; item: TriageItem } | null;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

const IMAGE_REFRESH_COOLDOWN_MS = 20_000;

/**
 * Moderations-Triage: Liste links, grosse Bildbühne rechts, Entscheidungen per Klick oder Tastatur
 * (`j`/`k` wählen, `a` freigeben/behalten, `r` ablehnen bzw. erledigen, `x` entfernen).
 * Entscheidungen wirken sofort (optimistisch); scheitert die Server Action, kehrt der Eintrag zurück.
 */
export function ModerationTriage({ mode, items, now: nowMs, premoderationCount, empty }: ModerationTriageProps) {
  const router = useRouter();
  const now = new Date(nowMs);
  const [visible, removeOptimistic] = useOptimistic(items, (state, keys: readonly string[]) => state.filter((i) => !keys.includes(i.key)));
  const [selection, setSelection] = useState<{ key: string | null; index: number }>({ key: items[0]?.key ?? null, index: 0 });
  const [dialog, setDialog] = useState<DialogState>(null);
  const [, startTransition] = useTransition();
  const shortcutState = useRef<ShortcutState>({ pendingSince: null });
  const scrollToActive = useRef(false);
  const lastImageRefresh = useRef(0);

  const found = visible.findIndex((i) => i.key === selection.key);
  const activeIndex = visible.length === 0 ? -1 : found >= 0 ? found : Math.min(selection.index, visible.length - 1);
  const active = activeIndex >= 0 ? visible[activeIndex] : null;

  useEffect(() => {
    if (!scrollToActive.current || !active) return;
    scrollToActive.current = false;
    document.getElementById(triageItemId(active.key))?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const select = (index: number, scroll = false) => {
    const item = visible[index];
    if (!item) return;
    scrollToActive.current = scroll;
    setSelection({ key: item.key, index });
  };

  /** Optimistisch entfernen, Auswahl auf den nächsten Eintrag, Server Action im Hintergrund. */
  const commit = (item: TriageItem, removedKeys: string[], run: () => Promise<ActionResult<void>>, success: ToastInput) => {
    const index = visible.findIndex((i) => i.key === item.key);
    const remaining = visible.filter((i) => !removedKeys.includes(i.key));
    const next = visible.slice(index + 1).find((i) => !removedKeys.includes(i.key)) ?? remaining.at(-1) ?? null;
    setSelection({ key: next?.key ?? null, index: next ? remaining.indexOf(next) : 0 });
    startTransition(async () => {
      removeOptimistic(removedKeys);
      const result = await run();
      if (result.ok) toast(success);
      else toast({ tone: "danger", title: "Nicht gespeichert – der Eintrag ist zurück", description: result.error });
    });
  };

  const decide = (decision: Decision, item: TriageItem | null = active) => {
    if (!item) return;
    if (decision !== "a") {
      setDialog({ decision, item });
      return;
    }
    const handle = `@${item.post.creator.handle}`;
    if (item.kind === "post") {
      commit(item, [item.key], () => approvePostAction(item.post.id), { tone: "success", title: `Post von ${handle} freigegeben`, description: "Er ist jetzt für Fans sichtbar." });
    } else {
      commit(item, [item.key], () => dismissReportAction(item.report.id), { tone: "success", title: "Meldung verworfen", description: `Der Post von ${handle} bleibt online.` });
    }
  };

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat) return;
    const editable = isEditable(event.target);
    // Globale Admin-Kürzel (g …, ?, ⌘K) haben Vorrang – sonst würde „g a“ zugleich freigeben.
    const { state, action } = resolveShortcut(shortcutState.current, {
      key: event.key,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      editable,
      time: event.timeStamp,
    });
    shortcutState.current = state;
    if (action || editable || event.metaKey || event.ctrlKey || event.altKey) return;
    if (dialog || document.querySelector("dialog[open]")) return;

    const key = event.key.toLowerCase();
    if (key === "j") select(Math.min(activeIndex + 1, visible.length - 1), true);
    else if (key === "k") select(Math.max(activeIndex - 1, 0), true);
    else if (key === "a" || key === "r" || key === "x") decide(key);
    else return;
    event.preventDefault();
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  /** Signierte URLs leben 300 s – läuft eine ab, holen wir frische (gedrosselt). */
  const refreshImages = () => {
    const t = Date.now();
    if (t - lastImageRefresh.current < IMAGE_REFRESH_COOLDOWN_MS) return;
    lastImageRefresh.current = t;
    router.refresh();
  };

  if (!active) return <>{empty}</>;

  const labels =
    active.kind === "post"
      ? { a: "Freigeben", r: "Ablehnen", x: "Entfernen" }
      : { a: "Verwerfen", r: "Berechtigt", x: "Post entfernen", xShort: "Entfernen" };

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="order-2 min-w-0 lg:order-1 lg:sticky lg:top-[68px] lg:max-h-[calc(100dvh-92px)] lg:self-start lg:overflow-y-auto lg:scrollbar-none">
        <TriageList mode={mode} items={visible} activeKey={active.key} now={now} onSelect={(i) => select(i)} />
        <p className="mt-3 hidden flex-wrap items-center gap-x-3 gap-y-1.5 px-1 font-mono text-[11px] text-ink-faint lg:flex">
          <span className="flex items-center gap-1">
            <Kbd>j</Kbd>
            <Kbd>k</Kbd> wählen
          </span>
          <span className="flex items-center gap-1">
            <Kbd>a</Kbd>
            <Kbd>r</Kbd>
            <Kbd>x</Kbd> entscheiden
          </span>
          <span className="flex items-center gap-1">
            <Kbd>?</Kbd> alle Kürzel
          </span>
        </p>
      </div>

      <section aria-label="Prüfung" className="order-1 grid min-w-0 content-start gap-4 lg:order-2">
        <div className="z-10 flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface p-2 lg:sticky lg:top-[56px]">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="px-2" onClick={() => select(activeIndex - 1, true)} disabled={activeIndex <= 0} aria-label="Vorheriger Eintrag (k)">
              <ChevronUp aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="px-2"
              onClick={() => select(activeIndex + 1, true)}
              disabled={activeIndex >= visible.length - 1}
              aria-label="Nächster Eintrag (j)"
            >
              <ChevronDown aria-hidden />
            </Button>
            <span className="px-1.5 font-mono text-xs text-ink-muted tabular-nums" aria-live="polite">
              {formatNumber(activeIndex + 1)} / {formatNumber(visible.length)}
            </span>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 sm:ml-auto sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
            <DecisionButton decision="a" label={labels.a} variant="primary" icon={active.kind === "post" ? <Check aria-hidden /> : <FlagOff aria-hidden />} onClick={() => decide("a")} />
            <DecisionButton decision="r" label={labels.r} variant="secondary" icon={active.kind === "post" ? <X aria-hidden /> : <ShieldCheck aria-hidden />} onClick={() => decide("r")} />
            <DecisionButton decision="x" label={labels.x} shortLabel={"xShort" in labels ? labels.xShort : undefined} variant="danger" icon={<Trash2 aria-hidden />} onClick={() => decide("x")} />
          </div>
        </div>

        <TriageStage key={active.key} item={active} now={now} premoderationCount={premoderationCount} onImageError={refreshImages} />
      </section>

      {dialog ? <DecisionDialog state={dialog} visible={visible} commit={commit} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function DecisionButton({
  decision,
  label,
  shortLabel,
  variant,
  icon,
  onClick,
}: {
  decision: Decision;
  label: string;
  /** Kürzere Beschriftung für schmale Bildschirme. */
  shortLabel?: string;
  variant: "primary" | "secondary" | "danger";
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button variant={variant} size="sm" onClick={onClick} aria-keyshortcuts={decision} className="px-2 max-sm:[&>svg]:hidden sm:px-3">
      {icon}
      {shortLabel ? (
        <>
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}
      {/* Eigene Taste statt <Kbd>: übernimmt die Textfarbe des Buttons (auch auf Akzent-Rot lesbar). */}
      <span aria-hidden className="ml-0.5 hidden h-[18px] min-w-[18px] items-center justify-center rounded-[3px] border border-current/35 px-1 font-mono text-[10px] leading-none uppercase opacity-80 sm:inline-flex">
        {decision}
      </span>
    </Button>
  );
}

type CommitFn = (item: TriageItem, removedKeys: string[], run: () => Promise<ActionResult<void>>, success: ToastInput) => void;

/** Notiz-Dialog für „ablehnen“, „berechtigt“ und „entfernen“ – schliesst sofort, die Aktion läuft optimistisch. */
function DecisionDialog({ state, visible, commit, onClose }: { state: NonNullable<DialogState>; visible: TriageItem[]; commit: CommitFn; onClose: () => void }) {
  const { item, decision } = state;
  const handle = `@${item.post.creator.handle}`;
  let props: Omit<ActionDialogProps, "onClose">;

  if (decision === "x") {
    const removedKeys = visible.filter((i) => i.post.id === item.post.id).map((i) => i.key);
    const reportCount = item.kind === "report" ? Math.max(item.report.openReportsOnPost, 1) : 0;
    props = {
      title: `Post von ${handle} entfernen`,
      description:
        reportCount > 0
          ? `Der Post verschwindet für alle Fans. ${reportCount === 1 ? "Die offene Meldung wird" : `Alle ${formatNumber(reportCount)} offenen Meldungen werden`} mit deiner Begründung erledigt.`
          : "Der Post verschwindet für alle Fans. Der Creator sieht deine Begründung im Studio.",
      confirmLabel: "Entfernen",
      tone: "danger",
      note: { label: "Begründung", placeholder: "z. B. Bild stammt nachweislich von einem anderen Account.", required: true },
      onConfirm: (note) => {
        commit(item, removedKeys, () => removePostAction(item.post.id, note), {
          tone: "success",
          title: `Post von ${handle} entfernt`,
          description: reportCount > 0 ? "Zugehörige Meldungen sind erledigt." : undefined,
        });
      },
    };
  } else if (item.kind === "post") {
    props = {
      title: `Post von ${handle} ablehnen`,
      description: "Der Post wird nicht veröffentlicht. Der Creator sieht deine Begründung und kann ihn überarbeitet neu hochladen.",
      confirmLabel: "Ablehnen",
      tone: "danger",
      note: {
        label: "Begründung für den Creator",
        placeholder: "z. B. Auf dem zweiten Bild ist ein Gesicht erkennbar – bitte zuschneiden.",
        hint: "Konkret und freundlich – was müsste anders sein?",
        required: true,
      },
      onConfirm: (note) => {
        commit(item, [item.key], () => rejectPostAction(item.post.id, note), { tone: "success", title: `Post von ${handle} abgelehnt`, description: "Die Begründung ist beim Creator." });
      },
    };
  } else {
    const reportId = item.report.id;
    props = {
      title: "Meldung als berechtigt erledigen",
      description: `Der Post von ${handle} bleibt online – du hast anders reagiert, z. B. den Creator kontaktiert. Zum Entfernen nimm «Post entfernen».`,
      confirmLabel: "Erledigen",
      note: { label: "Was hast du unternommen? (optional)", placeholder: "z. B. Creator hat die Quelle ergänzt und die Rechte nachgewiesen." },
      onConfirm: (note) => {
        commit(item, [item.key], () => resolveReportAction(reportId, note), { tone: "success", title: "Meldung erledigt", description: "Als berechtigt markiert." });
      },
    };
  }

  return <ActionDialog {...props} onClose={onClose} />;
}

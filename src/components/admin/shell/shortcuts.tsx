"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";

import { cn } from "@/components/ui/cn";
import { Kbd } from "@/components/ui/kbd";

import { ADMIN_NAV, openCommandPalette } from "./admin-nav";

/** Zeitfenster für die zweite Taste nach `g`. */
export const GO_TIMEOUT_MS = 1200;

export type ShortcutState = { pendingSince: number | null };
export type ShortcutKey = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  /** Fokus liegt in Eingabefeld/Textarea/Select/contenteditable */
  editable: boolean;
  /** Zeitstempel in ms (event.timeStamp) */
  time: number;
};
export type ShortcutAction = { type: "navigate"; href: string } | { type: "palette" } | { type: "help" } | { type: "pending" } | null;

const IDLE: ShortcutState = { pendingSince: null };

/** Reine Zustandsmaschine der Admin-Kürzel (testbar ohne DOM). */
export function resolveShortcut(state: ShortcutState, k: ShortcutKey): { state: ShortcutState; action: ShortcutAction } {
  if ((k.metaKey || k.ctrlKey) && k.key.toLowerCase() === "k") return { state: IDLE, action: { type: "palette" } };
  if (k.editable || k.metaKey || k.ctrlKey || k.altKey) return { state: IDLE, action: null };

  if (state.pendingSince !== null && k.time - state.pendingSince <= GO_TIMEOUT_MS) {
    const target = ADMIN_NAV.find((item) => item.key === k.key.toLowerCase());
    return { state: IDLE, action: target ? { type: "navigate", href: target.href } : null };
  }
  if (k.key === "?") return { state: IDLE, action: { type: "help" } };
  if (k.key === "g" || k.key === "G") return { state: { pendingSince: k.time }, action: { type: "pending" } };
  return { state: IDLE, action: null };
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

const HELP: { title: string; rows: { keys: string[][]; label: string }[] }[] = [
  {
    title: "Überall",
    rows: [
      { keys: [["⌘", "K"], ["Ctrl", "K"]], label: "Befehle & Suche" },
      { keys: [["?"]], label: "Diese Übersicht" },
      { keys: [["Esc"]], label: "Dialog schliessen" },
    ],
  },
  {
    title: "Springen zu",
    rows: ADMIN_NAV.map((item) => ({ keys: [["g", item.key]], label: item.label })),
  },
  {
    title: "Moderation",
    rows: [
      { keys: [["j"], ["k"]], label: "Nächster / vorheriger Eintrag" },
      { keys: [["a"]], label: "Freigeben" },
      { keys: [["r"]], label: "Ablehnen (mit Notiz)" },
      { keys: [["x"]], label: "Entfernen" },
    ],
  },
];

/** Globale Admin-Kürzel (`g d|v|m|u|p|s|a`, `⌘K`, `?`) + Hilfe-Dialog. */
export function Shortcuts() {
  const router = useRouter();
  const stateRef = useRef<ShortcutState>(IDLE);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      const { state, action } = resolveShortcut(stateRef.current, {
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        editable: isEditable(e.target),
        time: e.timeStamp,
      });
      stateRef.current = state;
      if (!action || action.type === "pending") return;
      e.preventDefault();
      if (action.type === "palette") {
        setHelpOpen(false);
        openCommandPalette();
      } else if (action.type === "help") {
        setHelpOpen((v) => !v);
      } else {
        setHelpOpen(false);
        router.push(action.href);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (helpOpen && !dialog.open) dialog.showModal();
    else if (!helpOpen && dialog.open) dialog.close();
  }, [helpOpen]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="admin-shortcuts-title"
      onClose={() => setHelpOpen(false)}
      onClick={(e) => e.target === e.currentTarget && setHelpOpen(false)}
      className={cn(
        "m-0 mx-auto mt-[12vh] w-[min(640px,calc(100vw-32px))] max-w-none rounded-card border border-line-strong bg-surface p-0 text-ink outline-none",
        "backdrop:bg-[rgb(8_6_5/0.74)] open:animate-rise",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-4">
        <h2 id="admin-shortcuts-title" className="font-display text-xl font-bold tracking-[-0.03em]">
          Tastaturkürzel
        </h2>
        <span className="font-num text-[11px] text-ink-faint">gilt nicht in Eingabefeldern</span>
      </div>
      <div className="grid gap-6 px-5 py-5 sm:grid-cols-2">
        {HELP.map((section) => (
          <section key={section.title} className={section.title === "Springen zu" ? "sm:row-span-2" : undefined}>
            <h3 className="eyebrow mb-3">{section.title}</h3>
            <dl className="grid gap-2">
              {section.rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 text-[13px]">
                  <dt className="text-ink-muted">{row.label}</dt>
                  <dd className="flex shrink-0 items-center gap-1 text-[11px] text-ink-faint">
                    {row.keys.map((combo, ci) => (
                      <Fragment key={ci}>
                        {ci > 0 ? <span className="px-0.5">/</span> : null}
                        {combo.map((k, ki) => (
                          <Fragment key={ki}>
                            {ki > 0 && combo[0] === "g" ? <span className="px-0.5">dann</span> : null}
                            <Kbd>{k}</Kbd>
                          </Fragment>
                        ))}
                      </Fragment>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}

"use client";

import { CircleCheck, Info, OctagonAlert, X } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/components/ui/cn";

export type ToastTone = "success" | "danger" | "neutral";
export type ToastInput = { tone?: ToastTone; title: string; description?: string };

const TOAST_EVENT = "happyfeet:admin-toast";
const VISIBLE_MS = 4500;
const MAX_TOASTS = 3;

/** Bestätigung/Fehler als kurze Einblendung (von überall im Admin aufrufbar). */
export function toast(input: ToastInput): void {
  window.dispatchEvent(new CustomEvent<ToastInput>(TOAST_EVENT, { detail: input }));
}

const ICONS = { success: CircleCheck, danger: OctagonAlert, neutral: Info } as const;
const ICON_COLORS = { success: "text-success", danger: "text-danger", neutral: "text-ink-faint" } as const;

type Item = ToastInput & { id: number; tone: ToastTone };

/** Einblendungen unten rechts (mobil unten, volle Breite). Einmal im Admin-Layout rendern. */
export function AdminToaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let seq = 0;
    const timers = new Set<number>();
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastInput>).detail;
      if (!detail?.title) return;
      const id = ++seq;
      setItems((prev) => [...prev, { ...detail, tone: detail.tone ?? "neutral", id }].slice(-MAX_TOASTS));
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        setItems((prev) => prev.filter((item) => item.id !== id));
      }, VISIBLE_MS);
      timers.add(timer);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-40 grid justify-items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px]"
    >
      {items.map((item) => {
        const Icon = ICONS[item.tone];
        return (
          <div
            key={item.id}
            className="pointer-events-auto flex w-full animate-rise items-start gap-3 rounded-card border border-line-strong bg-surface-2 py-3 pr-2 pl-3.5 text-ink"
          >
            <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", ICON_COLORS[item.tone])} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] leading-snug font-medium">{item.title}</p>
              {item.description ? <p className="mt-0.5 text-xs leading-snug text-ink-muted">{item.description}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
              className="grid size-6 shrink-0 place-items-center rounded-control text-ink-faint hover:bg-surface hover:text-ink"
            >
              <X aria-hidden className="size-3.5" />
              <span className="sr-only">Meldung schliessen</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

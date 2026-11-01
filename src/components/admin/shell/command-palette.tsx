"use client";

import { CornerDownLeft, ExternalLink, Flag, Search, UserRound, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/components/ui/cn";
import { Kbd } from "@/components/ui/kbd";

import { ADMIN_NAV, COMMAND_PALETTE_EVENT, openCommandPalette } from "./admin-nav";

export { openCommandPalette };

export type QuickSearchResult = { id: string; label: string; sublabel?: string; href: string };
export type QuickSearch = (q: string) => Promise<QuickSearchResult[]>;

const MIN_QUERY = 2;
const DEBOUNCE_MS = 160;

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
}

/** Präfix im Label > Wortanfang im Label > irgendwo im Label > Stichwort. Akzente egal. */
export function filterCommands<T extends { label: string; keywords?: string }>(items: readonly T[], query: string): T[] {
  const q = normalize(query);
  if (!q) return [...items];
  const scored: { item: T; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const label = normalize(item.label);
    const words = label.split(/[\s\-_/]+/);
    let score = -1;
    if (label.startsWith(q)) score = 0;
    else if (words.some((w) => w.startsWith(q))) score = 1;
    else if (label.includes(q)) score = 2;
    else if (item.keywords && normalize(item.keywords).split(/\s+/).some((w) => w.startsWith(q))) score = 3;
    if (score >= 0) scored.push({ item, score, index });
  });
  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((s) => s.item);
}

/** Nur Pfade dieser App – Suchresultate kommen vom Server, trotzdem nie `javascript:` & Co. pushen. */
export function isSafeHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//") && !href.includes("\\");
}

type Command = {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  keywords?: string;
  icon: LucideIcon;
  keys?: string[];
  group: "Navigation" | "Nutzer";
};

const NAV_COMMANDS: Command[] = [
  ...ADMIN_NAV.map((item) => ({
    id: `nav:${item.href}`,
    label: item.label,
    href: item.href,
    keywords: item.keywords,
    icon: item.icon,
    keys: ["g", item.key],
    group: "Navigation" as const,
  })),
  { id: "nav:reports", label: "Offene Meldungen", href: "/admin/moderation?tab=reports", keywords: "report melden kritisch", icon: Flag, group: "Navigation" },
  { id: "nav:site", label: "Zur Website", href: "/", keywords: "öffentlich explore startseite", icon: ExternalLink, group: "Navigation" },
];

export function CommandPaletteTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      className={cn(
        "flex h-full items-center gap-3 px-4 text-[13px] text-ink-muted transition-colors duration-100 hover:bg-surface hover:text-ink",
        className,
      )}
    >
      <Search aria-hidden className="size-4" />
      <span className="sr-only sm:not-sr-only">Suchen</span>
      <span aria-hidden className="hidden gap-0.5 sm:flex">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}

/** ⌘K-Befehlspalette: Navigation + Nutzer-Suche (über `quickSearch`, eine Server Action). */
export function CommandPalette({ quickSearch }: { quickSearch?: QuickSearch }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [users, setUsers] = useState<{ query: string; items: QuickSearchResult[]; failed: boolean } | null>(null);

  useEffect(() => {
    const onOpen = () => {
      setQuery("");
      setActive(0);
      setUsers(null);
      setOpen(true);
    };
    window.addEventListener(COMMAND_PALETTE_EVENT, onOpen);
    return () => window.removeEventListener(COMMAND_PALETTE_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const trimmed = query.trim();
  useEffect(() => {
    if (!open || !quickSearch || trimmed.length < MIN_QUERY) return;
    const id = ++requestRef.current;
    const timer = window.setTimeout(() => {
      quickSearch(trimmed).then(
        (items) => id === requestRef.current && setUsers({ query: trimmed, items: items.filter((i) => isSafeHref(i.href)), failed: false }),
        () => id === requestRef.current && setUsers({ query: trimmed, items: [], failed: true }),
      );
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [open, quickSearch, trimmed]);

  const searching = Boolean(quickSearch) && trimmed.length >= MIN_QUERY;
  const userResults = searching && users?.query === trimmed ? users : null;
  const pending = searching && !userResults;
  const commands: Command[] = [
    ...filterCommands(NAV_COMMANDS, query),
    ...(userResults?.items ?? []).map((u) => ({ id: `user:${u.id}`, label: u.label, sublabel: u.sublabel, href: u.href, icon: UserRound, group: "Nutzer" as const })),
  ];
  const activeIndex = Math.min(active, Math.max(0, commands.length - 1));

  const go = (cmd: Command | undefined) => {
    if (!cmd || !isSafeHref(cmd.href)) return;
    setOpen(false);
    router.push(cmd.href);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (commands.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + commands.length) % commands.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(commands[activeIndex]);
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <dialog
      ref={dialogRef}
      aria-label="Befehle und Suche"
      onClose={() => setOpen(false)}
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
      className={cn(
        "m-0 mx-auto mt-[12vh] w-[min(640px,calc(100vw-32px))] max-w-none overflow-hidden rounded-card border border-line-strong bg-surface p-0 text-ink outline-none",
        "backdrop:bg-[rgb(8_6_5/0.74)] open:animate-rise",
      )}
    >
      <div className="flex h-13 items-center gap-3 border-b border-line px-4">
        <Search aria-hidden className="size-4 shrink-0 text-ink-faint" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={commands.length > 0 ? optionId(activeIndex) : undefined}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={quickSearch ? "Seite oder Nutzer suchen …" : "Seite suchen …"}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
          spellCheck={false}
          autoComplete="off"
        />
        <Kbd>Esc</Kbd>
      </div>

      <ul id={listId} role="listbox" aria-label="Treffer" className="max-h-[min(60vh,420px)] overflow-y-auto py-2">
        {commands.map((cmd, i) => {
          const showGroup = i === 0 || commands[i - 1].group !== cmd.group;
          const Icon = cmd.icon;
          return (
            <li key={cmd.id} role="presentation">
              {showGroup ? (
                <p role="presentation" className="eyebrow px-4 pt-3 pb-2">
                  {cmd.group}
                </p>
              ) : null}
              <div
                id={optionId(i)}
                role="option"
                aria-selected={i === activeIndex}
                onMouseMove={() => i !== activeIndex && setActive(i)}
                onClick={() => go(cmd)}
                className="relative mx-2 flex h-10 cursor-pointer items-center gap-3 rounded-control px-3 text-sm text-ink-muted aria-selected:bg-surface-2 aria-selected:text-ink"
              >
                {i === activeIndex ? <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-accent" /> : null}
                <Icon aria-hidden className="size-4 shrink-0 text-ink-faint" />
                <span className="min-w-0 truncate">{cmd.label}</span>
                {cmd.sublabel ? <span className="min-w-0 truncate font-mono text-xs text-ink-faint">{cmd.sublabel}</span> : null}
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  {cmd.keys?.map((k, ki) => (
                    <Kbd key={ki}>{k}</Kbd>
                  ))}
                  {i === activeIndex ? <CornerDownLeft aria-hidden className="ml-1 size-3.5 text-ink-faint" /> : null}
                </span>
              </div>
            </li>
          );
        })}
        {pending ? (
          <li role="presentation" className="px-4 py-3 font-mono text-xs text-ink-faint">
            Suche Nutzer …
          </li>
        ) : null}
        {userResults?.failed ? (
          <li role="presentation" className="px-4 py-3 text-xs text-danger">
            Die Nutzersuche ist gerade nicht erreichbar.
          </li>
        ) : null}
        {!pending && commands.length === 0 ? (
          <li role="presentation" className="px-4 py-6 text-sm text-ink-muted">
            Keine Treffer für „{trimmed}“.
          </li>
        ) : null}
      </ul>

      <div className="flex items-center gap-4 border-t border-line px-4 py-2.5 font-mono text-[11px] text-ink-faint">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> wählen
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd> öffnen
        </span>
        <span className="ml-auto hidden sm:inline">⌘K / Ctrl K</span>
      </div>
    </dialog>
  );
}

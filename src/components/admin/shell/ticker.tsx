import { cn } from "@/components/ui/cn";

export type TickerItem = { label: string; value: string; delta?: string; direction?: "up" | "down" | "flat" };

const DIRECTION_TEXT = { up: "gestiegen", down: "gesunken", flat: "unverändert" } as const;

function Glyph({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "flat") return <span aria-hidden className="inline-block h-[1.5px] w-2 bg-current" />;
  return (
    <svg aria-hidden viewBox="0 0 8 8" className="size-2">
      <path d={direction === "up" ? "M4 1 7.5 7h-7Z" : "M4 7 .5 1h7Z"} fill="currentColor" />
    </svg>
  );
}

/**
 * Kennzahlen-Leiste („Tape“) oben im Admin. Statisch – keine Laufschrift; reicht der Platz nicht, horizontal
 * scrollbar (auch per Tastatur: fokussierbar). Richtung immer mit Glyphe + Screenreader-Text.
 */
export function Ticker({ items, className }: { items: TickerItem[]; className?: string }) {
  return (
    // tabIndex: scrollbare Region muss per Tastatur erreichbar sein (Pfeiltasten scrollen), Fokusrahmen innen.
    <div
      role="region"
      aria-label="Kennzahlen"
      tabIndex={0}
      className={cn(
        "relative flex min-w-0 overflow-x-auto scrollbar-none [mask-image:linear-gradient(to_right,#000_calc(100%-48px),transparent)] focus-visible:outline-offset-[-2px] focus-visible:[mask-image:none]",
        className,
      )}
    >
      <dl className="flex items-stretch pr-12">
        {items.map((item) => {
          const dir = item.direction ?? "flat";
          const color = !item.direction || dir === "flat" ? "text-ink-faint" : dir === "up" ? "text-success" : "text-danger";
          return (
            <div key={item.label} className="flex shrink-0 items-center gap-2.5 border-r border-line px-4 whitespace-nowrap">
              <dt className="text-[10.5px] font-medium tracking-[0.08em] text-ink-faint uppercase">{item.label}</dt>
              <dd className="font-mono text-[12.5px] text-ink tabular-nums">{item.value}</dd>
              {item.delta ? (
                <dd className={cn("inline-flex items-center gap-1 font-mono text-[11px] tabular-nums", color)}>
                  <Glyph direction={dir} />
                  <span className="sr-only">{DIRECTION_TEXT[dir]}:</span>
                  {item.delta}
                </dd>
              ) : null}
            </div>
          );
        })}
      </dl>
    </div>
  );
}

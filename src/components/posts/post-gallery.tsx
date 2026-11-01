"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/components/ui/cn";
import { SignedImg } from "@/components/ui/signed-img";

/** Ein Bild, wie es die Galerie braucht (Teilmenge von `MediaView`). */
export type GalleryImage = { id: string; url: string; width: number; height: number };

/** Rahmen-Seitenverhältnis: vom ersten Bild, aber nicht extremer als 4:5 bzw. 3:2. */
function frameRatio(first: GalleryImage | undefined): number {
  if (!first || first.width <= 0 || first.height <= 0) return 4 / 5;
  return Math.min(Math.max(first.width / first.height, 4 / 5), 3 / 2);
}

/**
 * Bilder eines freigeschalteten Posts: wischbar (Scroll-Snap), mit Pfeil-Buttons, Zähler und Pfeiltasten.
 * Signierte URLs → bewusst `<img>` (kein next/image), mit Breite/Höhe gegen Layout-Sprünge; abgelaufene Signaturen
 * erneuert `SignedImg`. `role="group"` statt Landmark: Der Feed hätte sonst Dutzende gleichnamige Regionen.
 */
export function PostGallery({ images, label }: { images: GalleryImage[]; label: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const ratio = frameRatio(images[0]);
  const count = images.length;

  const goTo = (next: number) => {
    const el = scroller.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(count - 1, next));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
  };

  const onScroll = () => {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(index - 1);
    }
  };

  if (count === 0) return null;

  return (
    <div
      role="group"
      aria-roledescription="Bildergalerie"
      aria-label={count > 1 ? `${label} – ${count} Bilder` : label}
      className="group/gallery relative overflow-hidden rounded-card bg-surface-2"
    >
      <div
        ref={scroller}
        onScroll={count > 1 ? onScroll : undefined}
        onKeyDown={count > 1 ? onKeyDown : undefined}
        tabIndex={count > 1 ? 0 : undefined}
        aria-label={count > 1 ? "Bilder – mit den Pfeiltasten blättern" : undefined}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scrollbar-none focus-visible:outline-offset-[-2px]"
        style={{ aspectRatio: String(ratio) }}
      >
        {images.map((image, i) => {
          const own = image.width > 0 && image.height > 0 ? image.width / image.height : ratio;
          const fits = Math.abs(own - ratio) / ratio < 0.08;
          return (
            <div key={image.id} className="relative h-full w-full shrink-0 snap-center" aria-hidden={count > 1 && i !== index ? true : undefined}>
              <SignedImg
                src={image.url}
                alt={count > 1 ? `${label}, Bild ${i + 1} von ${count}` : label}
                width={image.width}
                height={image.height}
                loading="lazy"
                decoding="async"
                draggable={false}
                className={cn("size-full", fits ? "object-cover" : "object-contain")}
              />
            </div>
          );
        })}
      </div>

      {count > 1 ? (
        <>
          <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-ink/70 px-2 py-1 font-mono text-[11px] leading-none text-canvas tabular-nums">
            <span className="sr-only">Bild </span>
            {index + 1} / {count}
          </span>
          <GalleryButton side="left" disabled={index === 0} onClick={() => goTo(index - 1)} />
          <GalleryButton side="right" disabled={index === count - 1} onClick={() => goTo(index + 1)} />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {images.map((image, i) => (
              <span
                key={image.id}
                className={cn("h-1.5 rounded-full transition-all duration-200", i === index ? "w-4 bg-canvas" : "w-1.5 bg-canvas/55")}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function GalleryButton({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "absolute top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface/90 text-ink",
        "opacity-0 transition-opacity duration-150 group-hover/gallery:opacity-100 focus-visible:opacity-100 disabled:opacity-0!",
        "max-sm:hidden",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon aria-hidden className="size-4" />
      <span className="sr-only">{side === "left" ? "Vorheriges Bild" : "Nächstes Bild"}</span>
    </button>
  );
}

import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";

import { Container } from "./container";

/** Ruhige Platzhalter-Fläche (pulsiert dezent; bei reduzierter Bewegung statisch). */
export function SkeletonBlock({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-control bg-surface-2", className)} />;
}

/** Seitenkopf-Platzhalter in der Höhe von `PageHeader`. */
export function SkeletonHeader() {
  return (
    <div className="border-b border-line pb-5">
      <SkeletonBlock className="h-3 w-28" />
      <SkeletonBlock className="mt-4 h-10 w-72 max-w-full sm:h-12" />
      <SkeletonBlock className="mt-3 h-4 w-96 max-w-full" />
    </div>
  );
}

export function CreatorCardSkeleton() {
  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <SkeletonBlock className="size-18 rounded-full" />
      <SkeletonBlock className="mt-5 h-6 w-40" />
      <SkeletonBlock className="mt-2 h-3 w-24" />
      <SkeletonBlock className="mt-4 h-3.5 w-full" />
      <SkeletonBlock className="mt-2 h-3.5 w-4/5" />
      <div className="mt-6 flex justify-between border-t border-line pt-4">
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-3 w-28" />
      </div>
    </div>
  );
}

export function PostCardSkeleton() {
  return (
    <div className="rounded-card border border-line bg-surface">
      <div className="flex items-center gap-3 px-4 py-3">
        <SkeletonBlock className="size-9 rounded-full" />
        <div className="grid gap-1.5">
          <SkeletonBlock className="h-3.5 w-32" />
          <SkeletonBlock className="h-3 w-24" />
        </div>
      </div>
      <div className="px-2">
        <SkeletonBlock className="aspect-[4/5] w-full rounded-card" />
      </div>
      <div className="grid gap-2 px-4 py-4">
        <SkeletonBlock className="h-3.5 w-3/4" />
        <SkeletonBlock className="h-3 w-20" />
      </div>
    </div>
  );
}

/** Lade-Status mit Screenreader-Hinweis. */
export function LoadingPage({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <Container className={cn("py-10 sm:py-14", className)}>
      <div role="status" aria-live="polite" className="sr-only">
        {label}
      </div>
      {children}
    </Container>
  );
}

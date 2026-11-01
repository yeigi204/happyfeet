import { cn } from "@/components/ui/cn";

/** Ruhiger Platzhalter-Block (pulsiert nur ohne „reduzierte Bewegung“). */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-card border border-line bg-surface motion-safe:animate-pulse", className)} />;
}

/** Platzhalter für Admin-Seiten: Kopf, Werkzeugleiste, Inhalt. */
export function AdminPageSkeleton({ label = "Wird geladen …" }: { label?: string }) {
  return (
    <div className="grid gap-6" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div aria-hidden className="grid gap-3 border-b border-line pb-5">
        <div className="h-2.5 w-40 rounded-full bg-surface-2 motion-safe:animate-pulse" />
        <div className="h-10 w-64 max-w-full rounded-control bg-surface-2 motion-safe:animate-pulse" />
        <div className="h-3.5 w-96 max-w-full rounded-full bg-surface-2 motion-safe:animate-pulse" />
      </div>
      <div aria-hidden className="h-9 w-80 max-w-full rounded-control bg-surface-2 motion-safe:animate-pulse" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SkeletonBlock className="h-80" />
        <SkeletonBlock className="h-80" />
      </div>
      <SkeletonBlock className="h-56" />
    </div>
  );
}

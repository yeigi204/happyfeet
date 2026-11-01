import { Container } from "@/components/site/container";
import { SkeletonBlock, SkeletonHeader } from "@/components/site/skeletons";

/** Lade-Zustand für Studio-Seiten: Seitenkopf, Kennzahlen-Raster, Inhaltsfläche. */
export function StudioPageSkeleton({ label, variant = "stats" }: { label: string; variant?: "stats" | "grid" | "form" }) {
  return (
    <Container className="py-8 sm:py-12">
      <div role="status" aria-live="polite" className="sr-only">
        {label}
      </div>
      <SkeletonHeader />
      {variant === "stats" ? (
        <>
          <div className="mt-8 grid gap-px overflow-hidden rounded-card border border-line bg-line min-[440px]:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="bg-surface p-4 sm:p-5">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="mt-3 h-7 w-32" />
                <SkeletonBlock className="mt-3 h-3 w-20" />
              </div>
            ))}
          </div>
          <SkeletonBlock className="mt-10 h-72 w-full rounded-card" />
        </>
      ) : variant === "form" ? (
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
          <SkeletonBlock className="min-h-72 w-full rounded-card sm:min-h-96" />
          <div className="grid content-start gap-3">
            <SkeletonBlock className="h-16 w-full" />
            <SkeletonBlock className="h-16 w-full" />
            <SkeletonBlock className="mt-3 h-32 w-full" />
            <SkeletonBlock className="mt-3 h-12 w-full" />
          </div>
        </div>
      ) : (
        <>
          <SkeletonBlock className="mt-8 h-9 w-72 max-w-full" />
          <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 rounded-card border border-line bg-surface p-2 sm:block sm:p-0">
                <SkeletonBlock className="aspect-[4/5] w-full rounded-[calc(var(--radius-card)-2px)] sm:rounded-b-none" />
                <div className="grid content-start gap-2 py-1 sm:p-4">
                  <SkeletonBlock className="h-5 w-32" />
                  <SkeletonBlock className="h-3.5 w-full" />
                  <SkeletonBlock className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Container>
  );
}

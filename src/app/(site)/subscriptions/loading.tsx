import { LoadingPage, SkeletonBlock, SkeletonHeader } from "@/components/site/skeletons";

export default function SubscriptionsLoading() {
  return (
    <LoadingPage label="Deine Abos werden geladen …">
      <SkeletonHeader />
      <SkeletonBlock className="mt-8 h-28 rounded-card" />
      <div className="mt-10 grid gap-px overflow-hidden rounded-card border border-line">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3.5 bg-surface px-5 py-4">
            <SkeletonBlock className="size-12 rounded-full" />
            <div className="grid flex-1 gap-2">
              <SkeletonBlock className="h-4 w-40" />
              <SkeletonBlock className="h-3 w-56 max-w-full" />
            </div>
            <SkeletonBlock className="hidden h-4 w-24 sm:block" />
          </div>
        ))}
      </div>
    </LoadingPage>
  );
}

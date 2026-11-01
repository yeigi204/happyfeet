import { CreatorCardSkeleton, LoadingPage, SkeletonHeader } from "@/components/site/skeletons";

export default function ExploreLoading() {
  return (
    <LoadingPage label="Creator werden geladen …">
      <SkeletonHeader />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <CreatorCardSkeleton key={i} />
        ))}
      </div>
    </LoadingPage>
  );
}

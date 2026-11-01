import { LoadingPage, PostCardSkeleton, SkeletonBlock, SkeletonHeader } from "@/components/site/skeletons";

export default function FeedLoading() {
  return (
    <LoadingPage label="Dein Feed wird geladen …">
      <SkeletonHeader />
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,660px)_320px] xl:justify-between">
        <div className="grid gap-6">
          <PostCardSkeleton />
          <PostCardSkeleton />
        </div>
        <SkeletonBlock className="hidden h-72 rounded-card lg:block" />
      </div>
    </LoadingPage>
  );
}

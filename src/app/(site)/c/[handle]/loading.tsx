import { LoadingPage, PostCardSkeleton, SkeletonBlock } from "@/components/site/skeletons";

/** Profil-Gerüst: Titelbild, Avatar, Name/Bio, Abo-Panel und zwei Posts – entspricht dem Raster der Seite. */
export default function CreatorProfileLoading() {
  return (
    <LoadingPage label="Profil wird geladen …" className="pt-4 sm:pt-8">
      <SkeletonBlock className="aspect-[2/1] w-full rounded-card sm:aspect-[3/1] lg:aspect-[4/1]" />
      <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="lg:col-start-1">
          <SkeletonBlock className="relative -mt-12 -ml-1 size-24 rounded-full border-4 border-canvas sm:-mt-16 sm:size-32" />
          <SkeletonBlock className="mt-4 h-10 w-64 max-w-full sm:h-14 sm:w-96" />
          <SkeletonBlock className="mt-3 h-4 w-40" />
          <SkeletonBlock className="mt-5 h-4 w-full max-w-[60ch]" />
          <SkeletonBlock className="mt-2 h-4 w-4/5 max-w-[48ch]" />
          <div className="mt-6 flex gap-8 border-t border-line pt-4">
            <SkeletonBlock className="h-8 w-20" />
            <SkeletonBlock className="h-8 w-16" />
            <SkeletonBlock className="h-8 w-24" />
          </div>
        </div>
        <SkeletonBlock className="mt-8 h-80 rounded-card lg:col-start-2 lg:row-span-2 lg:row-start-1" />
        <div className="mt-12 lg:col-start-1">
          <SkeletonBlock className="h-7 w-24" />
          <div className="mt-6 grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <PostCardSkeleton />
            <PostCardSkeleton />
          </div>
        </div>
      </div>
    </LoadingPage>
  );
}

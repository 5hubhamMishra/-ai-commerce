import { SkeletonBlock, SkeletonText } from "@/components/Skeleton";

export default function ProductLoading() {
  return (
    <main className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:px-8">
      <SkeletonBlock className="aspect-square w-full" />
      <div className="flex flex-col gap-4 py-4">
        <SkeletonText className="h-4 w-24" />
        <SkeletonText className="h-10 w-3/4" />
        <SkeletonText className="h-6 w-32" />
        <SkeletonText className="h-24 w-full" />
        <SkeletonBlock className="mt-4 h-12 w-40" />
      </div>
    </main>
  );
}

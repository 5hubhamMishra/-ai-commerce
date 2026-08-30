import { SkeletonBlock, SkeletonText } from "@/components/Skeleton";

export default function AiShoppingLoading() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-3xl flex-col px-4 py-6 sm:px-6">
      <div className="flex items-center gap-3 border-b border-[var(--clr-border)] pb-4">
        <SkeletonBlock className="h-9 w-9 shrink-0 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2">
          <SkeletonText className="h-4 w-24" />
          <SkeletonText className="h-3 w-56" />
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-4 py-8">
        <SkeletonText className="h-12 w-3/4" />
        <SkeletonText className="ml-auto h-12 w-1/2" />
        <SkeletonBlock className="h-14 w-full rounded-2xl" />
      </div>
    </main>
  );
}

/** Thin wrapper around the `.skeleton` shimmer utility (globals.css) —
 *  a reusable loading placeholder for the moment between first paint and
 *  Zustand's localStorage rehydration, replacing a blank flash with a
 *  visible "this is loading" state. `aria-hidden` since it's decorative;
 *  the real content it stands in for announces itself once rendered. */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function SkeletonText({ className = "h-4 w-full" }: { className?: string }) {
  return <SkeletonBlock className={className} />;
}

/** A generic "page of cards" loading shell — title bar + a grid of
 *  card-shaped blocks — reused by every page whose real content is a
 *  product grid (wishlist, recommendations) so the loading state isn't a
 *  different shape from page to page. */
export function ListPageSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <SkeletonText className="h-7 w-56 mb-6" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <SkeletonBlock className="aspect-square w-full" />
            <SkeletonText className="h-3 w-3/4" />
            <SkeletonText className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A generic "page of horizontal rows" loading shell — reused by cart and
 *  order history, which render a vertical list of line-item-shaped cards
 *  rather than a grid. */
export function RowsPageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <SkeletonText className="h-7 w-40 mb-6" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-[var(--clr-border)] p-4 flex gap-4">
            <SkeletonBlock className="h-24 w-24 shrink-0" />
            <div className="flex-1 flex flex-col gap-2 justify-center">
              <SkeletonText className="h-4 w-2/3" />
              <SkeletonText className="h-3 w-1/3" />
              <SkeletonText className="h-4 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

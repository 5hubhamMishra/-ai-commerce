"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useRecommendations } from "@/lib/hooks/useRecommendations";
import { fromProductListItem } from "@/lib/catalog-mappers";
import CatalogProductGrid from "@/components/catalog/CatalogProductGrid";
import { ListPageSkeleton } from "@/components/Skeleton";

export default function RecommendationsPage() {
  const hydrated = useStore((s) => s.hydrated);
  const events = useStore((s) => s.events);
  const user = useStore((s) => s.user);
  const anonymousId = useStore((s) => s.anonymousId);
  const behavioralProfile = useStore((s) => s.behavioralProfile);
  const personalizationEnabled = useStore((s) => s.personalizationEnabled);

  const hasHistory =
    personalizationEnabled &&
    (user ? (behavioralProfile?.eventCount ?? 0) > 0 : events.length >= 3);

  const recommended = useRecommendations("personalized", {
    limit: 24,
    anonymousId: anonymousId ?? undefined,
  });
  const products = useMemo(
    () => recommended?.map((r) => fromProductListItem(r.product)) ?? null,
    [recommended],
  );
  const reasons = useMemo(() => {
    const map: Record<string, string> = {};
    recommended?.forEach((r) => (map[r.product.id] = r.reasons[0]));
    return map;
  }, [recommended]);

  if (!hydrated || !products) return <ListPageSkeleton cards={10} />;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
      <div className="flex items-center flex-wrap gap-2">
        <h1 className="font-display text-2xl font-semibold">
          Recommended for you
        </h1>
        {hasHistory ? (
          <span className="badge badge-accent ml-2 align-middle">
            Personalized
          </span>
        ) : (
          <span className="badge badge-subtle ml-2 align-middle">
            Popular picks
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-[var(--clr-text-secondary)]">
        {hasHistory
          ? "Ranked using your real browsing, wishlist, cart, and order activity."
          : "Popular picks — recommendations get more personal as you browse and save products."}
      </p>

      {!hasHistory && personalizationEnabled && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3 items-start">
          <svg
            className="w-5 h-5 text-amber-600 mt-0.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Your picks get more personal as you browse
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Browse and save products to personalize these recommendations.
            </p>
          </div>
        </div>
      )}

      {!personalizationEnabled && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 flex gap-3 items-start">
          <svg
            className="w-5 h-5 text-red-600 mt-0.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-900">
              Personalization is paused
            </p>
            <p className="text-xs text-red-700 mt-0.5">
              Personalization is turned off in your profile settings, so
              we&apos;re showing popular picks instead.
            </p>
          </div>
        </div>
      )}

      <div className="mt-6">
        <CatalogProductGrid products={products} reasons={reasons} />
      </div>
    </div>
  );
}

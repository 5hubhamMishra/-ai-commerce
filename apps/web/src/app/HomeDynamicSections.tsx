"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useRecommendations } from "@/lib/hooks/useRecommendations";
import { useProductIndex } from "@/lib/hooks/useProductIndex";
import { fromProductListItem } from "@/lib/catalog-mappers";
import type { CatalogCardProduct } from "@/components/catalog/CatalogProductCard";
import { listDemoProducts } from "@/lib/demo-catalog";
import CatalogProductGrid from "@/components/catalog/CatalogProductGrid";
import Section from "@/components/Section";
import { SkeletonBlock } from "@/components/Skeleton";

export default function HomeDynamicSections({
  fallbackProducts,
}: {
  fallbackProducts: CatalogCardProduct[];
}) {
  const hydrated = useStore((s) => s.hydrated);
  const events = useStore((s) => s.events);
  const user = useStore((s) => s.user);
  const anonymousId = useStore((s) => s.anonymousId);
  const behavioralProfile = useStore((s) => s.behavioralProfile);
  const recentlyViewedReal = useStore((s) => s.recentlyViewedReal);
  const personalizationEnabled = useStore((s) => s.personalizationEnabled);

  const hasHistory =
    personalizationEnabled &&
    (user
      ? (behavioralProfile?.eventCount ?? 0) > 0
      : recentlyViewedReal.length > 0 || events.length >= 3);

  const recommended = useRecommendations("personalized", {
    limit: 10,
    anonymousId: anonymousId ?? undefined,
  });
  const trending = useRecommendations("trending", { limit: 10 });
  const productIndex = useProductIndex();

  const demoFeaturedCards = useMemo(
    () =>
      listDemoProducts({ featured: true, pageSize: 10 }).items.map(
        fromProductListItem,
      ),
    [],
  );
  const featuredFallback =
    fallbackProducts.length > 0 ? fallbackProducts : demoFeaturedCards;
  const recommendedCards = useMemo(
    () => recommended?.map((r) => fromProductListItem(r.product)) ?? null,
    [recommended],
  );
  const reasons = useMemo(() => {
    const map: Record<string, string> = {};
    recommended?.forEach((r) => (map[r.product.id] = r.reasons[0]));
    return map;
  }, [recommended]);
  const trendingCards = useMemo(
    () => trending?.map((r) => fromProductListItem(r.product)) ?? null,
    [trending],
  );
  const recentCards = useMemo(() => {
    if (!productIndex) return null;
    return recentlyViewedReal
      .map((id) => productIndex.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .slice(0, 10)
      .map(fromProductListItem);
  }, [recentlyViewedReal, productIndex]);

  return (
    <>
      {hydrated && recentCards && recentCards.length > 0 && (
        <Section
          title="Continue shopping"
          subtitle="Pick up where you left off"
          variant="scroll"
        >
          <CatalogProductGrid products={recentCards} />
        </Section>
      )}

      <Section
        title={hasHistory ? "Recommended for you" : "Popular right now"}
        subtitle={
          hasHistory
            ? "Based on what you've browsed and saved"
            : "Loved by shoppers across the store"
        }
        href="/recommendations"
      >
        {recommendedCards ? (
          <CatalogProductGrid
            products={
              recommendedCards.length > 0 ? recommendedCards : featuredFallback
            }
            reasons={reasons}
          />
        ) : (
          <SkeletonBlock className="h-64 w-full" />
        )}
      </Section>

      <Section title="Trending now" subtitle="Highly rated, frequently bought">
        {trendingCards ? (
          <CatalogProductGrid
            products={
              trendingCards.length > 0 ? trendingCards : featuredFallback
            }
          />
        ) : (
          <SkeletonBlock className="h-64 w-full" />
        )}
      </Section>
    </>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { dealsProducts, categories } from "@/lib/data";
import { useCategories } from "@/lib/hooks/useCategories";
import { useRecommendations } from "@/lib/hooks/useRecommendations";
import { useProductIndex } from "@/lib/hooks/useProductIndex";
import { fromProductListItem } from "@/lib/catalog-mappers";
import CatalogProductGrid from "@/components/catalog/CatalogProductGrid";
import ProductGrid from "@/components/ProductGrid";
import Section from "@/components/Section";
import { SkeletonBlock } from "@/components/Skeleton";

export default function Home() {
  const hydrated = useStore((s) => s.hydrated);
  const events = useStore((s) => s.events);
  const user = useStore((s) => s.user);
  const anonymousId = useStore((s) => s.anonymousId);
  const behavioralProfile = useStore((s) => s.behavioralProfile);
  const recentlyViewedReal = useStore((s) => s.recentlyViewedReal);
  const personalizationEnabled = useStore((s) => s.personalizationEnabled);

  // A real signed-in user's history lives server-side (behavioralProfile.eventCount);
  // an anonymous visitor only has this browser's local event count as a proxy.
  const hasHistory =
    personalizationEnabled && (user ? (behavioralProfile?.eventCount ?? 0) > 0 : events.length >= 3);

  const recommended = useRecommendations("personalized", { limit: 10, anonymousId: anonymousId ?? undefined });
  const trending = useRecommendations("trending", { limit: 10 });
  const productIndex = useProductIndex();

  const recommendedCards = useMemo(
    () => recommended?.map((r) => fromProductListItem(r.product)) ?? null,
    [recommended],
  );
  const reasons = useMemo(() => {
    const map: Record<string, string> = {};
    recommended?.forEach((r) => (map[r.product.id] = r.reasons[0]));
    return map;
  }, [recommended]);
  const trendingCards = useMemo(() => trending?.map((r) => fromProductListItem(r.product)) ?? null, [trending]);

  const recentCards = useMemo(() => {
    if (!productIndex) return null;
    return recentlyViewedReal
      .map((id) => productIndex.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .slice(0, 10)
      .map(fromProductListItem);
  }, [recentlyViewedReal, productIndex]);

  const deals = useMemo(() => dealsProducts(10), []);

  const realCategories = useCategories();

  const topCategoryName = useMemo(() => {
    if (!behavioralProfile) return undefined;
    const topId = Object.entries(behavioralProfile.categoryAffinity.viewed).sort((a, b) => b[1] - a[1])[0]?.[0];
    return topId ? realCategories.find((c) => c.id === topId)?.name : undefined;
  }, [behavioralProfile, realCategories]);

  return (
    <div>
      <Hero topCategory={hasHistory ? topCategoryName : undefined} />

      {hydrated && recentCards && recentCards.length > 0 && (
        <Section title="Continue shopping" subtitle="Pick up where you left off" variant="scroll">
          <CatalogProductGrid products={recentCards} />
        </Section>
      )}

      <Section
        title={hasHistory ? "Recommended for you" : "Popular right now"}
        subtitle={hasHistory ? "Based on what you've browsed and saved" : "Loved by shoppers across the store"}
        href="/recommendations"
      >
        {recommendedCards ? <CatalogProductGrid products={recommendedCards} reasons={reasons} /> : <SkeletonBlock className="h-64 w-full" />}
      </Section>

      <Section title="Today's deals" subtitle="Limited-time price drops" href="/shop">
        <ProductGrid products={deals} />
      </Section>

      <Section title="Trending now" subtitle="Highly rated, frequently bought">
        {trendingCards ? <CatalogProductGrid products={trendingCards} /> : <SkeletonBlock className="h-64 w-full" />}
      </Section>

      <section className="w-full py-14" style={{ background: 'var(--clr-surface-2)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-semibold" style={{ color: 'var(--clr-text-primary)' }}>Shop by category</h2>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {realCategories.map((c) => (
              <Link
                key={c.slug}
                href={`/category/${c.slug}`}
                className="rounded-2xl overflow-hidden relative h-40 group cursor-pointer"
                style={{ background: 'var(--clr-surface)' }}
              >
                <Image src={`/products/${c.slug}.svg`} alt={c.name} fill className="object-cover transition-transform duration-500 group-hover:scale-110" />
                <div className="absolute inset-0 transition-opacity duration-200 opacity-0 group-hover:opacity-100 bg-gradient-to-t from-amber-900/40 to-transparent" />
                <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-stone-950/90 to-transparent text-sm font-semibold text-white">
                  {c.name}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Hero({ topCategory }: { topCategory?: string }) {
  return (
    <section className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0c0a09 0%, #1c1917 60%, #292524 100%)' }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 50% at 30% 50%, rgba(180,83,9,0.18) 0%, transparent 70%)' }} />
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-20 sm:px-6 lg:px-8 relative z-10 md:grid-cols-2 md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--clr-accent)' }}>
            {topCategory ? `Because you like ${topCategory.toLowerCase()}` : "New here? Start exploring"}
          </p>
          <h1 className="font-display text-5xl sm:text-6xl font-semibold leading-[1.1] text-white">
            Shopping that<br/><span style={{ color: 'var(--clr-accent)' }}>gets you.</span>
          </h1>
          <p className="mt-5 text-base leading-relaxed max-w-md" style={{ color: '#a8a29e' }}>
            Search in plain language, get picks tuned to how you actually shop, and ask ShopAI when you&apos;re not
            sure what you need.
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/shop" className="btn btn-accent">
              Browse the catalog
            </Link>
            <Link href="/ai-shopping" className="btn" style={{ background: 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid rgba(255,255,255,0.15)' }}>
              Ask ShopAI →
            </Link>
          </div>
        </div>
        <div className="hidden md:block">
          <div className="grid grid-cols-2 gap-3">
            {categories.slice(0, 8).map((c, i) => (
              <Link
                key={c.slug}
                href={`/category/${c.slug}`}
                className={`relative h-36 rounded-2xl overflow-hidden cursor-pointer hover:ring-2 ring-[var(--clr-accent)] transition-all duration-200 ${
                  i === 1 || i === 4 ? "mt-5" : i === 2 || i === 5 ? "-mt-5" : ""
                }`}
              >
                <Image src={`/products/${c.slug}.svg`} alt={c.name} fill className="object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 to-transparent" />
                <div className="absolute bottom-2 left-2.5 text-xs font-semibold text-white">{c.name}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

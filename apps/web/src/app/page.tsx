"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { buildProfile, recommendForProfile } from "@/lib/recommend";
import { popularProducts, dealsProducts, getProduct, categories } from "@/lib/data";
import ProductGrid from "@/components/ProductGrid";
import Section from "@/components/Section";
import type { Product } from "@/lib/types";

export default function Home() {
  const hydrated = useStore((s) => s.hydrated);
  const events = useStore((s) => s.events);
  const recentlyViewed = useStore((s) => s.recentlyViewed);
  const personalizationEnabled = useStore((s) => s.personalizationEnabled);

  const profile = useMemo(() => buildProfile(events), [events]);
  const hasHistory = events.length >= 3 && personalizationEnabled;

  const recommendedScored = useMemo(() => {
    if (!hasHistory) return null;
    return recommendForProfile(profile, events, 10);
  }, [hasHistory, profile, events]);

  const recommended = recommendedScored ? recommendedScored.map((s) => s.product) : popularProducts(10);
  const reasons = useMemo(() => {
    const map: Record<string, string> = {};
    recommendedScored?.forEach((s) => (map[s.product.id] = s.reasons[0]));
    return map;
  }, [recommendedScored]);

  const recentProducts = useMemo(
    () => recentlyViewed.map((id) => getProduct(id)).filter((p): p is Product => Boolean(p)).slice(0, 10),
    [recentlyViewed]
  );

  const deals = useMemo(() => dealsProducts(10), []);
  const trending = useMemo(() => popularProducts(10), []);

  const topCategory = Object.entries(profile.categoryAffinity).sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <div>
      <Hero topCategory={hasHistory ? topCategory : undefined} />

      {hydrated && recentProducts.length > 0 && (
        <Section title="Continue shopping" subtitle="Pick up where you left off" variant="scroll">
          <ProductGrid products={recentProducts} variant="scroll" />
        </Section>
      )}

      <Section
        title={hasHistory ? "Recommended for you" : "Popular right now"}
        subtitle={hasHistory ? "Based on what you've browsed and saved" : "Loved by shoppers across the store"}
        href="/recommendations"
      >
        <ProductGrid products={recommended} reasons={reasons} />
      </Section>

      <Section title="Today's deals" subtitle="Limited-time price drops" href="/shop?deals=1">
        <ProductGrid products={deals} />
      </Section>

      <Section title="Trending now" subtitle="Highly rated, frequently bought">
        <ProductGrid products={trending} />
      </Section>

      <section className="w-full py-14" style={{ background: 'var(--clr-surface-2)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-semibold" style={{ color: 'var(--clr-text-primary)' }}>Shop by category</h2>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {categories.map((c) => (
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

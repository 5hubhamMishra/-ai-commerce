"use client";

import { useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { getCategory, productsInCategory } from "@/lib/data";
import ProductGrid from "@/components/ProductGrid";
import { useStore } from "@/lib/store";

export default function CategoryPageClient({ slug }: { slug: string }) {
  const category = getCategory(slug);
  const trackEvent = useStore((s) => s.trackEvent);

  const products = useMemo(() => (category ? productsInCategory(slug) : []), [category, slug]);

  useEffect(() => {
    if (category) trackEvent("CATEGORY_VIEWED", { category: category.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // The server-side page.tsx already calls notFound() for an unknown slug
  // before this client component ever renders.
  if (!category) return null;

  return (
    <>
      <div className="relative overflow-hidden bg-stone-950 w-full min-h-[180px]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 flex items-center justify-between gap-8 h-full">
          <div>
            <div className="text-xs text-stone-500">
              <Link href="/" className="hover:text-stone-300">Home</Link> › <span className="text-stone-300">{category.name}</span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white mt-2">{category.name}</h1>
            <p className="mt-2 text-sm text-stone-400">
              {products.length} products • {category.brands.slice(0, 4).join(', ')}{category.brands.length > 4 ? ' & more' : ''}
            </p>
          </div>
          <div className="hidden md:block relative h-36 w-48 rounded-2xl overflow-hidden opacity-80">
            <Image src={`/products/${slug}.svg`} alt={category.name} fill className="object-cover" unoptimized />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <ProductGrid products={products} />
      </div>
    </>
  );
}

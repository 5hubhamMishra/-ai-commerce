"use client";

import { startTransition, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Category, ListProductsResponse } from "@ai-commerce/types";
import { catalogApi } from "@ai-commerce/api-client";
import CatalogProductGrid from "@/components/catalog/CatalogProductGrid";
import { fromProductListItem } from "@/lib/catalog-mappers";
import { useStore } from "@/lib/store";

const PAGE_SIZE = 20;

export default function CategoryPageClient({ initialCategory }: { initialCategory: Category }) {
  const category = initialCategory;
  const trackEvent = useStore((s) => s.trackEvent);
  const trackRealEvent = useStore((s) => s.trackRealEvent);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ListProductsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    trackEvent("CATEGORY_VIEWED", { category: category.name });
    trackRealEvent("CATEGORY_VIEWED", category.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.slug]);

  useEffect(() => {
    let cancelled = false;
    startTransition(() => setLoading(true));
    catalogApi
      .listCategoryProducts(category.slug, { page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (!cancelled) {
          setResult(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [category.slug, page]);

  const products = result ? result.items.map(fromProductListItem) : [];
  const total = result?.total ?? 0;
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

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
              {loading ? "Loading…" : `${total} products`}
            </p>
          </div>
          <div className="hidden md:block relative h-36 w-48 rounded-2xl overflow-hidden opacity-80">
            <Image src={`/products/${category.slug}.svg`} alt={category.name} fill className="object-cover" unoptimized />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <CatalogProductGrid products={products} />
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-xl border border-[var(--clr-border)] px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-[var(--clr-text-secondary)]">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-xl border border-[var(--clr-border)] px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </>
  );
}

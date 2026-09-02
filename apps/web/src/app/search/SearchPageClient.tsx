"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SearchResponse } from "@ai-commerce/types";
import CatalogProductGrid from "@/components/catalog/CatalogProductGrid";
import { fromSearchResultItem } from "@/lib/catalog-mappers";
import { useStore } from "@/lib/store";

export default function SearchPageClient({
  initialQuery,
  initialResult,
}: {
  initialQuery: string;
  initialResult: SearchResponse | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const trackRealEvent = useStore((s) => s.trackRealEvent);
  const products = initialResult
    ? initialResult.items.map(fromSearchResultItem)
    : [];
  const understood = initialResult?.understood ?? null;

  useEffect(() => {
    if (!initialQuery) return;
    trackRealEvent("PRODUCT_SEARCHED", undefined, { query: initialQuery });
  }, [initialQuery, trackRealEvent]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <form onSubmit={onSubmit} className="max-w-2xl w-full mx-auto relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--clr-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Try "good headphones for gym under 5000"'
          className="w-full rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] pl-12 pr-4 py-3 text-sm outline-none focus:border-[var(--clr-accent)] focus:ring-1 focus:ring-[var(--clr-accent)] transition-all shadow-sm"
        />
      </form>

      {initialQuery && understood && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {understood.category && (
            <span className="badge badge-subtle">{understood.category}</span>
          )}
          {understood.brand && (
            <span className="badge badge-subtle">{understood.brand}</span>
          )}
          {understood.maxPrice !== null && (
            <span className="badge badge-subtle">
              Under ₹{understood.maxPrice.toLocaleString("en-IN")}
            </span>
          )}
        </div>
      )}

      {initialQuery ? (
        <div className="mt-8">
          <h2 className="mb-4 text-sm text-[var(--clr-text-secondary)]">
            {`${initialResult?.total ?? 0} results for "${initialQuery}"`}
          </h2>
          {products.length > 0 ? (
            <CatalogProductGrid products={products} />
          ) : (
            <div className="py-16 flex flex-col items-center text-center">
              <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="var(--clr-border-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <h2 className="font-display text-xl font-semibold mt-4">
                No results for &ldquo;{initialQuery}&rdquo;
              </h2>
              <Link href={`/ai-shopping?q=${encodeURIComponent(initialQuery)}`} className="btn btn-accent mt-4">Ask ShopAI</Link>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-16 py-12 flex flex-col items-center text-center bg-[var(--clr-surface-2)] rounded-3xl border border-[var(--clr-border)] max-w-2xl mx-auto">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--clr-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <h2 className="font-display text-xl font-semibold mt-4">Search in plain language</h2>
          <ul className="text-sm mt-3 text-[var(--clr-text-secondary)] space-y-1">
            <li>&quot;Wireless earbuds under 2000&quot;</li>
            <li>&quot;Premium smartwatch for running&quot;</li>
            <li>&quot;Sony noise cancelling headphones&quot;</li>
          </ul>
        </div>
      )}
    </div>
  );
}

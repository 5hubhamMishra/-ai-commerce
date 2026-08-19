"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { searchProducts, parseQuery } from "@/lib/search";
import ProductGrid from "@/components/ProductGrid";
import { useStore } from "@/lib/store";
import Link from "next/link";

function SearchContent() {
  const params = useSearchParams();
  const router = useRouter();
  const initialQuery = params.get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  const trackEvent = useStore((s) => s.trackEvent);

  const results = useMemo(() => searchProducts(initialQuery), [initialQuery]);
  const parsed = useMemo(() => (initialQuery ? parseQuery(initialQuery) : null), [initialQuery]);

  useEffect(() => {
    if (initialQuery) trackEvent("PRODUCT_SEARCHED", { query: initialQuery });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  function onSubmit(e: React.FormEvent) {
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

      {parsed && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {parsed.category && <span className="badge badge-subtle">{parsed.category}</span>}
          {parsed.brand && <span className="badge badge-subtle">{parsed.brand}</span>}
          {parsed.maxPrice !== undefined && <span className="badge badge-subtle">Under ₹{parsed.maxPrice.toLocaleString("en-IN")}</span>}
        </div>
      )}

      {initialQuery ? (
        <div className="mt-8">
          <h2 className="mb-4 text-sm text-[var(--clr-text-secondary)]">
            {results.length} results for &ldquo;{initialQuery}&rdquo;
          </h2>
          {results.length > 0 ? (
            <ProductGrid products={results} />
          ) : (
            <div className="py-16 flex flex-col items-center text-center">
              <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="var(--clr-border-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <h2 className="font-display text-xl font-semibold mt-4">No results for &ldquo;{initialQuery}&rdquo;</h2>
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

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchContent />
    </Suspense>
  );
}

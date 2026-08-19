"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { products as allProducts } from "@/lib/data";
import ProductGrid from "@/components/ProductGrid";
import Filters, { type FilterState } from "@/components/Filters";
import { useStore } from "@/lib/store";

function FilterIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function ShopContent() {
  const params = useSearchParams();
  const dealsOnly = params.get("deals") === "1";
  const trackEvent = useStore((s) => s.trackEvent);
  const [state, setState] = useState<FilterState>({ sort: "relevance" as const });
  const [filterOpen, setFilterOpen] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const filterButton = filterButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    filterPanelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setFilterOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      filterButton?.focus();
    };
  }, [filterOpen]);

  const brands = useMemo(() => {
    const set = new Set(allProducts.filter((p) => !state.category || p.category === state.category).map((p) => p.brand));
    return Array.from(set).sort();
  }, [state.category]);

  const filtered = useMemo(() => {
    let list = allProducts;
    if (dealsOnly) list = list.filter((p) => p.compareAtPrice && p.compareAtPrice > p.price);
    if (state.category) list = list.filter((p) => p.category === state.category);
    if (state.brand) list = list.filter((p) => p.brand === state.brand);
    if (state.maxPrice) list = list.filter((p) => p.price <= state.maxPrice!);

    const sorted = [...list];
    if (state.sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
    else if (state.sort === "price-desc") sorted.sort((a, b) => b.price - a.price);
    else if (state.sort === "rating") sorted.sort((a, b) => b.rating - a.rating);
    return sorted;
  }, [state, dealsOnly]);

  function handleFilterChange(next: FilterState) {
    setState(next);
    trackEvent("FILTER_USED", { category: next.category, brand: next.brand, metadata: { sort: next.sort } });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div className="flex items-center">
          <h1 className="font-display text-2xl font-semibold">
            {dealsOnly ? "Today's Deals" : "All Products"}
          </h1>
          {dealsOnly && <span className="badge badge-accent ml-2">Sale</span>}
        </div>
        <div className="flex items-center gap-4">
          {Object.keys(state).length > 0 && state.sort !== "relevance" || state.category || state.brand || state.maxPrice ? (
            <span className="text-sm text-[var(--clr-text-secondary)]">{filtered.length} products</span>
          ) : (
            <span className="text-sm text-[var(--clr-text-secondary)] hidden lg:inline">{filtered.length} products</span>
          )}
          <button
            ref={filterButtonRef}
            onClick={() => setFilterOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-[var(--clr-border)] px-3 py-2 text-sm font-medium lg:hidden"
            style={{ color: 'var(--clr-text-secondary)' }}
            aria-haspopup="dialog"
            aria-expanded={filterOpen}
            aria-controls="filter-drawer"
          >
            <FilterIcon /> Filters
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block sticky top-24 h-fit rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-5">
          <Filters state={state} onChange={handleFilterChange} brands={brands} />
        </aside>
        <div>
          <ProductGrid products={filtered} />
        </div>
      </div>

      {filterOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setFilterOpen(false)} aria-hidden="true" />
          <div
            id="filter-drawer"
            ref={filterPanelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            tabIndex={-1}
            className="fixed inset-y-0 left-0 w-4/5 max-w-sm bg-[var(--clr-surface)] p-6 shadow-xl overflow-y-auto slide-in-left outline-none"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl font-semibold">Filters</h2>
              <button onClick={() => setFilterOpen(false)} className="p-2 text-[var(--clr-text-secondary)]" aria-label="Close filters">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <Filters state={state} onChange={handleFilterChange} brands={brands} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={null}>
      <ShopContent />
    </Suspense>
  );
}

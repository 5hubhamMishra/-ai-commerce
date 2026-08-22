"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import type { Brand, Category, ListProductsResponse } from "@ai-commerce/types";
import { catalogApi } from "@ai-commerce/api-client";
import CatalogProductGrid from "@/components/catalog/CatalogProductGrid";
import Filters, { type FilterState } from "@/components/Filters";
import { fromProductListItem } from "@/lib/catalog-mappers";
import { useStore } from "@/lib/store";

const PAGE_SIZE = 20;

function FilterIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function ShopContent() {
  const trackEvent = useStore((s) => s.trackEvent);
  const [state, setState] = useState<FilterState>({ sort: "newest" });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ListProductsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    catalogApi.listCategories().then(setCategories).catch(() => setCategories([]));
    catalogApi.listBrands().then(setBrands).catch(() => setBrands([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    catalogApi
      .listProducts({
        page,
        pageSize: PAGE_SIZE,
        category: state.category,
        brand: state.brand,
        maxPrice: state.maxPrice,
        sort: state.sort,
      })
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
  }, [state, page]);

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

  function handleFilterChange(next: FilterState) {
    setState(next);
    setPage(1);
    trackEvent("FILTER_USED", { category: next.category, brand: next.brand, metadata: { sort: next.sort } });
  }

  const products = result ? result.items.map(fromProductListItem) : [];
  const total = result?.total ?? 0;
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div className="flex items-center">
          <h1 className="font-display text-2xl font-semibold">All Products</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[var(--clr-text-secondary)]">
            {loading ? "Loading…" : `${total} products`}
          </span>
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
          <Filters state={state} onChange={handleFilterChange} categories={categories} brands={brands} />
        </aside>
        <div>
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
            <Filters state={state} onChange={handleFilterChange} categories={categories} brands={brands} />
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

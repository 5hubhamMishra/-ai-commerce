"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { products, getProduct } from "@/lib/data";
import { formatPrice } from "@/lib/format";
import RatingStars from "@/components/RatingStars";
import { useStore } from "@/lib/store";

export default function ComparePage() {
  const [ids, setIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const trackEvent = useStore((s) => s.trackEvent);

  const selected = useMemo(() => ids.map((id) => getProduct(id)).filter(Boolean), [ids]);
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q) && !ids.includes(p.id)).slice(0, 6);
  }, [query, ids]);

  const specKeys = useMemo(() => {
    const keys = new Set<string>();
    selected.forEach((p) => p && Object.keys(p.specs).forEach((k) => keys.add(k)));
    return Array.from(keys);
  }, [selected]);

  function addProduct(id: string) {
    if (ids.length >= 4) return;
    setIds((prev) => [...prev, id]);
    setQuery("");
    trackEvent("PRODUCT_COMPARED", { productId: id });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 lg:px-8">
      <h1 className="font-display text-2xl font-semibold">Compare Products</h1>
      <p className="mt-1 text-sm text-[var(--clr-text-secondary)]">Add up to 4 products to compare side by side.</p>

      {ids.length < 4 && (
        <div className="relative mt-5 max-w-md">
          <label htmlFor="compare-search" className="sr-only">
            Search a product to add to comparison
          </label>
          <input
            id="compare-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a product to add..."
            role="combobox"
            aria-expanded={matches.length > 0}
            aria-controls="compare-search-results"
            autoComplete="off"
            className="rounded-2xl border border-[var(--clr-border)] px-4 py-3 text-sm w-full outline-none focus:border-[var(--clr-accent)] focus:ring-1 focus:ring-[var(--clr-accent)] bg-[var(--clr-surface)]"
          />
          {matches.length > 0 && (
            <div id="compare-search-results" role="listbox" className="absolute z-20 mt-1 w-full rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] shadow-[var(--shadow-modal)] overflow-hidden">
              {matches.map((p) => (
                <button
                  key={p.id}
                  role="option"
                  aria-selected={false}
                  onClick={() => addProduct(p.id)}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-[var(--clr-surface-2)] flex justify-between items-center"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-[var(--clr-text-secondary)]">{formatPrice(p.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selected.length === 0 ? (
        <div className="empty-state mt-10 p-12 text-center rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] flex flex-col items-center">
          <svg className="h-12 w-12 text-[var(--clr-text-disabled)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <h2 className="font-display text-xl font-semibold">No products selected</h2>
          <p className="mt-2 text-sm text-[var(--clr-text-secondary)]">Search and add products above to compare their specifications.</p>
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-[var(--clr-border)]">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="w-44 p-4 text-xs font-semibold uppercase tracking-widest text-left" style={{ color: 'var(--clr-text-disabled)', background: 'var(--clr-surface-2)' }}>Spec</th>
                {selected.map((p) => (
                  <th key={p!.id} className="p-4 text-left align-top bg-[var(--clr-surface-2)] min-w-[200px] border-l border-[var(--clr-border)]">
                    <div className="rounded-xl overflow-hidden h-14 w-14 relative bg-stone-100">
                      <Image src={p!.images[0]} alt={p!.name} fill className="object-cover" />
                    </div>
                    <p className="font-semibold text-sm mt-2">{p!.name}</p>
                    <p className="text-xs text-[var(--clr-text-secondary)] mt-0.5">{formatPrice(p!.price)}</p>
                    <button
                      onClick={() => setIds((prev) => prev.filter((id) => id !== p!.id))}
                      className="text-xs text-[var(--clr-error,red)] hover:underline mt-1"
                    >
                      Remove
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[var(--clr-border)]">
                <td className="p-3 text-xs font-medium w-44" style={{ color: 'var(--clr-text-secondary)' }}>Price</td>
                {selected.map((p) => (
                  <td key={p!.id} className="p-3 text-sm text-[var(--clr-text-primary)] font-medium border-l border-[var(--clr-border)]">
                    {formatPrice(p!.price)}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-[var(--clr-border)] bg-[var(--clr-surface-2)]">
                <td className="p-3 text-xs font-medium w-44" style={{ color: 'var(--clr-text-secondary)' }}>Rating</td>
                {selected.map((p) => (
                  <td key={p!.id} className="p-3 text-sm text-[var(--clr-text-primary)] border-l border-[var(--clr-border)]">
                    <RatingStars rating={p!.rating} count={p!.reviewCount} />
                  </td>
                ))}
              </tr>
              {specKeys.map((key, i) => (
                <tr key={key} className={`border-t border-[var(--clr-border)] ${i % 2 === 0 ? 'bg-[var(--clr-surface)]' : 'bg-[var(--clr-surface-2)]'}`}>
                  <td className="p-3 text-xs font-medium w-44" style={{ color: 'var(--clr-text-secondary)' }}>{key}</td>
                  {selected.map((p) => (
                    <td key={p!.id} className="p-3 text-sm text-[var(--clr-text-primary)] border-l border-[var(--clr-border)]">
                      {p!.specs[key] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

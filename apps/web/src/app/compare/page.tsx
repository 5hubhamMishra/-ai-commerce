"use client";

import { Fragment, startTransition, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { ComparisonResponse, ProductListItem } from "@ai-commerce/types";
import { catalogApi, comparisonApi } from "@ai-commerce/api-client";
import {
  getDemoProductById,
  listDemoProducts,
  mergeDemoProducts,
} from "@/lib/demo-catalog";
import { formatPrice } from "@/lib/format";
import { useStore } from "@/lib/store";

const MAX_COMPARE = 4;

function createLocalComparison(
  products: ProductListItem[],
): ComparisonResponse {
  const details = products.map((product) => getDemoProductById(product.id));
  const items = products.map((product) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    brand: product.brand?.name ?? null,
    category: product.category.name,
    imageUrl: product.primaryImageUrl,
    minPrice: product.minPrice,
    maxPrice: product.maxPrice,
  }));

  const overviewRows = [
    {
      key: "Price",
      values: products.map((product) =>
        product.minPrice != null ? formatPrice(product.minPrice) : null,
      ),
    },
    {
      key: "Brand",
      values: products.map((product) => product.brand?.name ?? null),
    },
    {
      key: "Category",
      values: products.map((product) => product.category.name),
    },
    {
      key: "Rating",
      values: products.map((product) =>
        product.rating != null ? `${product.rating.toFixed(1)} / 5` : null,
      ),
    },
    {
      key: "Stock",
      values: products.map((product) =>
        product.inStock ? "In stock" : "Out of stock",
      ),
    },
  ];

  const specGroups = new Map<string, Set<string>>();
  for (const detail of details) {
    for (const spec of detail?.specifications ?? []) {
      if (!specGroups.has(spec.group)) specGroups.set(spec.group, new Set());
      specGroups.get(spec.group)!.add(spec.key);
    }
  }

  const attributeMatrix = [
    { group: "Overview", rows: overviewRows },
    ...Array.from(specGroups.entries()).map(([group, keys]) => ({
      group,
      rows: Array.from(keys).map((key) => ({
        key,
        values: details.map(
          (detail) =>
            detail?.specifications.find(
              (spec) => spec.group === group && spec.key === key,
            )?.value ?? null,
        ),
      })),
    })),
  ];

  return { items, attributeMatrix };
}

export default function ComparePage() {
  const [selected, setSelected] = useState<ProductListItem[]>([]);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ProductListItem[]>([]);
  const trackRealEvent = useStore((s) => s.trackRealEvent);

  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useMemo(() => selected.map((product) => product.id), [selected]);

  // Debounced live search for the add-product picker.
  useEffect(() => {
    if (!query.trim()) {
      startTransition(() => setMatches([]));
      return;
    }
    let cancelled = false;
    const localMatches = listDemoProducts({ search: query, pageSize: 6 }).items;
    startTransition(() => {
      setMatches(localMatches.filter((p) => !ids.includes(p.id)));
    });
    const timer = setTimeout(() => {
      catalogApi
        .listProducts({ search: query, pageSize: 6 })
        .then((res) => {
          const merged = mergeDemoProducts(res, { search: query, pageSize: 6 });
          if (!cancelled) {
            setMatches(merged.items.filter((p) => !ids.includes(p.id)));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setMatches(
              listDemoProducts({ search: query, pageSize: 6 }).items.filter(
                (p) => !ids.includes(p.id),
              ),
            );
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, ids]);

  useEffect(() => {
    if (ids.length < 2) {
      startTransition(() => setComparison(null));
      return;
    }
    if (selected.some((product) => getDemoProductById(product.id))) {
      startTransition(() => {
        setComparison(createLocalComparison(selected));
        setError(null);
        setLoading(false);
      });
      return;
    }
    let cancelled = false;
    startTransition(() => {
      setLoading(true);
      setError(null);
    });
    comparisonApi
      .compare(ids)
      .then((res) => {
        if (!cancelled) setComparison(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setComparison(createLocalComparison(selected));
          setError(
            err instanceof Error
              ? `${err.message} Showing an on-page comparison instead.`
              : "Showing an on-page comparison instead.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ids, selected]);

  function addProduct(product: ProductListItem) {
    if (ids.length >= MAX_COMPARE) return;
    if (ids.includes(product.id)) return;
    setSelected((prev) => [...prev, product]);
    setQuery("");
    setMatches([]);
    trackRealEvent("PRODUCT_COMPARED", product.id);
  }

  function removeProduct(id: string) {
    setSelected((prev) => prev.filter((product) => product.id !== id));
  }

  function addBestMatch() {
    const bestMatch = matches[0];
    if (bestMatch) addProduct(bestMatch);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 lg:px-8 pb-16">
      <h1 className="font-display text-2xl font-semibold">Compare Products</h1>
      <p className="mt-1 text-sm text-[var(--clr-text-secondary)]">
        Add 2-4 products to compare side by side.
      </p>

      {ids.length < MAX_COMPARE && (
        <div className="relative mt-5 max-w-md">
          <label htmlFor="compare-search" className="sr-only">
            Search a product to add to comparison
          </label>
          <input
            id="compare-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addBestMatch();
              }
            }}
            placeholder="Search a product to add..."
            role="combobox"
            aria-expanded={matches.length > 0}
            aria-controls="compare-search-results"
            autoComplete="off"
            className="rounded-2xl border border-[var(--clr-border)] px-4 py-3 text-sm w-full outline-none focus:border-[var(--clr-accent)] focus:ring-1 focus:ring-[var(--clr-accent)] bg-[var(--clr-surface)]"
          />
          {matches.length > 0 && (
            <div
              id="compare-search-results"
              role="listbox"
              className="absolute z-20 mt-1 w-full rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] shadow-[var(--shadow-modal)] overflow-hidden"
            >
              {matches.map((p) => (
                <button
                  key={p.id}
                  role="option"
                  aria-selected={false}
                  onClick={() => addProduct(p)}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-[var(--clr-surface-2)] flex justify-between items-center"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-[var(--clr-text-secondary)]">
                    {p.minPrice != null ? formatPrice(p.minPrice) : "—"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 text-sm"
          style={{ color: "var(--clr-error, #dc2626)" }}
        >
          {error}
        </p>
      )}

      {ids.length === 0 ? (
        <div className="empty-state mt-10 p-12 text-center rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] flex flex-col items-center">
          <svg
            className="h-12 w-12 text-[var(--clr-text-disabled)] mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
            />
          </svg>
          <h2 className="font-display text-xl font-semibold">
            No products selected
          </h2>
          <p className="mt-2 text-sm text-[var(--clr-text-secondary)]">
            Search and add products above to compare their specifications.
          </p>
        </div>
      ) : ids.length === 1 ? (
        <div className="empty-state mt-10 p-12 text-center rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] flex flex-col items-center">
          <h2 className="font-display text-xl font-semibold">
            Add one more product
          </h2>
          <p className="mt-2 text-sm font-medium">{selected[0]?.name}</p>
          <p className="mt-2 text-sm text-[var(--clr-text-secondary)]">
            Comparison needs at least 2 products.
          </p>
          {selected[0] && (
            <button
              onClick={() => removeProduct(selected[0].id)}
              className="mt-3 text-xs text-[var(--clr-error,red)] hover:underline"
            >
              Remove
            </button>
          )}
        </div>
      ) : loading && !comparison ? (
        <div className="mt-8 h-64 rounded-2xl skeleton" aria-hidden="true" />
      ) : comparison ? (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-[var(--clr-border)]">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th
                  className="w-44 p-4 text-xs font-semibold uppercase tracking-widest text-left"
                  style={{
                    color: "var(--clr-text-disabled)",
                    background: "var(--clr-surface-2)",
                  }}
                >
                  Spec
                </th>
                {comparison.items.map((p) => (
                  <th
                    key={p.id}
                    className="p-4 text-left align-top bg-[var(--clr-surface-2)] min-w-[200px] border-l border-[var(--clr-border)]"
                  >
                    <div className="rounded-xl overflow-hidden h-14 w-14 relative bg-stone-100">
                      {p.imageUrl && (
                        <Image
                          src={p.imageUrl}
                          alt={p.name}
                          fill
                          className="object-cover"
                        />
                      )}
                    </div>
                    <p className="font-semibold text-sm mt-2">{p.name}</p>
                    {p.brand && (
                      <p className="text-xs text-[var(--clr-text-secondary)]">
                        {p.brand}
                      </p>
                    )}
                    <p className="text-xs text-[var(--clr-text-secondary)] mt-0.5">
                      {p.minPrice != null
                        ? p.minPrice !== p.maxPrice
                          ? `From ${formatPrice(p.minPrice)}`
                          : formatPrice(p.minPrice)
                        : "—"}
                    </p>
                    <button
                      onClick={() => removeProduct(p.id)}
                      className="text-xs text-[var(--clr-error,red)] hover:underline mt-1"
                    >
                      Remove
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.attributeMatrix.map((group) => (
                <Fragment key={group.group}>
                  {comparison.attributeMatrix.length > 1 && (
                    <tr
                      key={`${group.group}-header`}
                      className="border-t border-[var(--clr-border)]"
                    >
                      <td
                        colSpan={comparison.items.length + 1}
                        className="px-3 py-2 text-xs font-bold uppercase tracking-widest"
                        style={{
                          color: "var(--clr-text-disabled)",
                          background: "var(--clr-surface-2)",
                        }}
                      >
                        {group.group}
                      </td>
                    </tr>
                  )}
                  {group.rows.map((row, i) => (
                    <tr
                      key={`${group.group}-${row.key}`}
                      className={`border-t border-[var(--clr-border)] ${i % 2 === 0 ? "bg-[var(--clr-surface)]" : "bg-[var(--clr-surface-2)]"}`}
                    >
                      <td
                        className="p-3 text-xs font-medium w-44"
                        style={{ color: "var(--clr-text-secondary)" }}
                      >
                        {row.key}
                      </td>
                      {row.values.map((value, j) => (
                        <td
                          key={comparison.items[j].id}
                          className="p-3 text-sm text-[var(--clr-text-primary)] border-l border-[var(--clr-border)]"
                        >
                          {value ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { ProductListItem } from "@ai-commerce/types";
import { catalogApi } from "@ai-commerce/api-client";
import { listDemoProducts } from "@/lib/demo-catalog";

let cachedIndex: Map<string, ProductListItem> | null = null;
let inflight: Promise<Map<string, ProductListItem>> | null = null;

async function loadFullCatalog(): Promise<Map<string, ProductListItem>> {
  const index = new Map<string, ProductListItem>();
  const first = await catalogApi.listProducts({ page: 1, pageSize: 100 });
  for (const p of first.items) index.set(p.id, p);
  const totalPages = Math.max(1, Math.ceil(first.total / first.pageSize));
  for (let page = 2; page <= totalPages; page += 1) {
    const res = await catalogApi.listProducts({ page, pageSize: 100 });
    for (const p of res.items) index.set(p.id, p);
  }
  for (const p of listDemoProducts({ pageSize: 100 }).items) {
    index.set(p.id, p);
  }
  return index;
}

/** Fetches the entire real catalog once (paginated, cached for the tab's lifetime) and
 *  returns an id -> product map. apps/api's recommendation endpoints return bare
 *  `{productId, score, reasons}` with no enriched product data, and there's no public
 *  batch-by-id lookup — for a catalog this size (~100 products), fetching it all once and
 *  resolving ids client-side is the practical way to render real recommendation cards.
 *  Doesn't scale to a large catalog; would need a real batch-by-id endpoint at that point. */
export function useProductIndex(): Map<string, ProductListItem> | null {
  const [index, setIndex] = useState<Map<string, ProductListItem> | null>(
    cachedIndex,
  );

  useEffect(() => {
    // Already captured correctly by useState's initializer above if it was set before
    // this component ever mounted — nothing to synchronize in that case.
    if (cachedIndex) return;
    let cancelled = false;
    if (!inflight) {
      inflight = loadFullCatalog().catch(() => {
        const fallback = new Map<string, ProductListItem>();
        for (const p of listDemoProducts({ pageSize: 100 }).items) {
          fallback.set(p.id, p);
        }
        return fallback;
      });
    }
    inflight.then((result) => {
      cachedIndex = result;
      if (!cancelled) setIndex(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return index;
}

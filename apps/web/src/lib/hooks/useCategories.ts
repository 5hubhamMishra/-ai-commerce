"use client";

import { useEffect, useState } from "react";
import type { Category } from "@ai-commerce/types";
import { catalogApi } from "@ai-commerce/api-client";

/** Real, active category tree from apps/api — used by real-catalog surfaces (Shop's
 *  filters, Home's "Shop by category" tiles, Footer's "Shop" links). Distinct from
 *  lib/data.ts's static `categories`, which still backs the fake-catalog surfaces
 *  (recommend.ts/shopai.ts/admin.ts) untouched by this phase. */
export function useCategories(): Category[] {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    catalogApi
      .listCategories()
      .then((result) => {
        if (!cancelled) setCategories(result);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return categories;
}

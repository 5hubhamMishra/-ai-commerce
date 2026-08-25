"use client";

import { useEffect, useState } from "react";
import type { Category } from "@ai-commerce/types";
import { catalogApi } from "@ai-commerce/api-client";
import { demoCategories } from "@/lib/demo-catalog";

/** Real, active category tree from apps/api — used by every real-catalog surface (Shop's
 *  filters, Home's Hero/"Shop by category" tiles, Footer's "Shop" links, the profile
 *  page's affinity display). */
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
        if (!cancelled) setCategories(demoCategories);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return categories;
}

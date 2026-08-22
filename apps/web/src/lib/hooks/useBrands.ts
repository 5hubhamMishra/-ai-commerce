"use client";

import { useEffect, useState } from "react";
import type { Brand } from "@ai-commerce/types";
import { catalogApi } from "@ai-commerce/api-client";

/** Real, active brand list from apps/api — mirrors useCategories.ts's pattern. Used to
 *  resolve real brand UUIDs (e.g. from a behavioral profile's affinity maps) into names. */
export function useBrands(): Brand[] {
  const [brands, setBrands] = useState<Brand[]>([]);

  useEffect(() => {
    let cancelled = false;
    catalogApi
      .listBrands()
      .then((result) => {
        if (!cancelled) setBrands(result);
      })
      .catch(() => {
        if (!cancelled) setBrands([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return brands;
}

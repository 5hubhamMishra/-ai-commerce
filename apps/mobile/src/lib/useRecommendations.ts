import { useEffect, useState } from 'react';
import type { ProductListItem, ScoredProduct } from '@ai-commerce/types';
import { recommendationsApi } from '@ai-commerce/api-client';
import { useProductIndex } from './useProductIndex';

export type RecommendedProduct = { product: ProductListItem; score: number; reasons: string[] };

export type RecommendationKind = 'personalized' | 'trending' | 'similar' | 'frequentlyBoughtWith';

/** Real recommendations from apps/api, resolved against the catalog index into renderable
 *  products. Unlike apps/web's version, there is no anonymousId param — every screen that can
 *  reach this hook is already behind RootNavigator's authenticated gate, so there is no
 *  logged-out caller on mobile to give one to. Returns `null` while loading (either the
 *  recommendation list or the catalog index). */
export function useRecommendations(
  kind: RecommendationKind,
  opts: { productId?: string; limit?: number; enabled?: boolean } = {},
): RecommendedProduct[] | null {
  const { productId, limit = 12, enabled = true } = opts;
  const index = useProductIndex();
  const [scored, setScored] = useState<ScoredProduct[] | null>(null);

  useEffect(() => {
    if (!enabled || ((kind === 'similar' || kind === 'frequentlyBoughtWith') && !productId)) {
      setScored(null);
      return;
    }
    let cancelled = false;
    const query = { limit };
    const request =
      kind === 'personalized'
        ? recommendationsApi.list(query)
        : kind === 'trending'
          ? recommendationsApi.trending(query)
          : kind === 'similar'
            ? recommendationsApi.similar(productId!, query)
            : recommendationsApi.frequentlyBoughtWith(productId!, query);
    request
      .then((result) => {
        if (!cancelled) setScored(result);
      })
      .catch(() => {
        if (!cancelled) setScored([]);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, productId, limit, enabled]);

  if (!scored || !index) return null;
  const resolved: RecommendedProduct[] = [];
  for (const s of scored) {
    const product = index.get(s.productId);
    if (product) resolved.push({ product, score: s.score, reasons: s.reasons });
  }
  return resolved;
}

/** Matches the `ScoredProduct` shape every apps/api recommendation endpoint returns —
 *  note this is IDs only, never enriched product data (name/image/price/slug). Callers need
 *  to resolve `productId` against a real product lookup of their own. */
export type ScoredProduct = {
  productId: string;
  score: number;
  reasons: string[];
};

export type ListRecommendationsQuery = {
  limit?: number;
  anonymousId?: string;
};

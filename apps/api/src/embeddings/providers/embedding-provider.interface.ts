export type EmbeddingInput = {
  productId: string;
  name: string;
  description: string;
  categoryId: string;
  brandId: string | null;
  tags: string[];
  specificationValues: string[];
};

export type EmbeddingResult = {
  vector: number[];
};

/**
 * Provider abstraction so a real hosted embedding model can be swapped in
 * without touching EmbeddingsService or anything that consumes it — same
 * interface-plus-injection-token-plus-dev-adapter shape as every other
 * pluggable integration point in this codebase (Payment/Shipping/Seller
 * verification/Seller payout — see DECISIONS.md ADR-015/ADR-020). Only
 * `HashingEmbeddingAdapter` exists this phase; see ADR-023 for why.
 */
export interface EmbeddingProvider {
  readonly dimensions: number;
  embed(input: EmbeddingInput): Promise<EmbeddingResult>;
}

export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

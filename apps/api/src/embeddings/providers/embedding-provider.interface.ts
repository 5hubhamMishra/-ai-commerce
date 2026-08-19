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
 * `HashingEmbeddingAdapter` exists as of Phase 8; see ADR-023/ADR-024 for why.
 */
export interface EmbeddingProvider {
  readonly dimensions: number;
  embed(input: EmbeddingInput): Promise<EmbeddingResult>;
  /** Embeds arbitrary free text into the same vector space as `embed()`'s
   *  product vectors — Phase 8's semantic search embeds a search-box query
   *  this way, then compares it against stored product embeddings. Must stay
   *  dimensionally and semantically compatible with `embed()`'s output for
   *  cosine similarity between the two to mean anything. */
  embedText(text: string): Promise<EmbeddingResult>;
}

export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

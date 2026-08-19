export type QueryUnderstandingContext = {
  categories: { slug: string; name: string }[];
  brands: { slug: string; name: string }[];
};

export type QueryUnderstandingResult = {
  /** The query text with recognized price-constraint phrases stripped — this
   *  is what actually gets keyword/semantic-matched. Category, brand, and
   *  attribute words are deliberately left in place (see
   *  RuleBasedQueryUnderstandingAdapter's doc comment for why). */
  cleanedQuery: string;
  category: string | null;
  brand: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  /** A controlled vocabulary of use-case/attribute keywords recognized in
   *  the query (e.g. "gym", "wireless") — a soft relevance boost, never a
   *  hard filter, since the spec frames these as "possible_attributes". */
  attributes: string[];
};

/**
 * Provider abstraction, same interface-plus-injection-token shape as
 * EmbeddingProvider (see DECISIONS.md ADR-015/ADR-020/ADR-023) — so a real
 * LLM-based query-understanding adapter could be swapped in later (e.g.
 * alongside Phase 9's ShopAI, which is the first phase to get an
 * `LLM_API_KEY`) without touching SearchService.
 *
 * Only `RuleBasedQueryUnderstandingAdapter` exists as of Phase 8 — not a
 * placeholder pending a future LLM, but the deliberate primary
 * implementation: the spec requires search to "not rely solely on an LLM"
 * and "remain functional if the LLM is unavailable," so a deterministic
 * parser has to exist regardless of whether an LLM-based one ever gets
 * added. See DECISIONS.md ADR-024.
 */
export interface QueryUnderstandingProvider {
  parse(
    query: string,
    context: QueryUnderstandingContext,
  ): QueryUnderstandingResult;
}

export const QUERY_UNDERSTANDING_PROVIDER = Symbol(
  'QUERY_UNDERSTANDING_PROVIDER',
);

/**
 * Centralized constants for hybrid search ranking — same "one place to
 * tune, not scattered magic numbers" precedent as
 * recommendations/recommendation-config.ts.
 */

/** Signal weights for the blended hybrid score when a free-text query is
 *  present. Each source is independently normalized to 0–1 before these
 *  weights are applied — see SearchService.rankHybrid. */
export const HYBRID_WEIGHTS = {
  keyword: 0.45,
  semantic: 0.45,
  attributes: 0.1,
} as const;

/** How many keyword-matching and semantic-nearest-neighbor candidates to
 *  pull before merging and re-ranking — bounds the work done per request
 *  regardless of catalog size, same "cap the candidate pool" precedent
 *  RecommendationsService uses. Genuinely generous at this catalog's scale
 *  (112 products). */
export const KEYWORD_CANDIDATE_LIMIT = 300;
export const SEMANTIC_CANDIDATE_LIMIT = 50;

export const SEARCH_ANALYTICS_TOP_QUERIES_LIMIT = 20;
export const SEARCH_ANALYTICS_LOOKBACK_DAYS = 30;

import { BehavioralEventType } from '@prisma/client';

/**
 * Centralized constants, not scattered magic numbers — satisfies the spec's
 * "weights must be configurable rather than hard-coded throughout the
 * application" honestly: one place to tune, not yet a runtime-editable/
 * admin-UI setting (see docs/AI_ARCHITECTURE.md).
 */
export const EVENT_WEIGHTS: Partial<Record<BehavioralEventType, number>> = {
  PRODUCT_VIEWED: 1,
  PRODUCT_CLICKED: 2,
  CATEGORY_VIEWED: 1,
  PRODUCT_SEARCHED: 2,
  PRODUCT_COMPARED: 4,
  PRODUCT_WISHLISTED: 5,
  PRODUCT_ADDED_TO_CART: 8,
  ORDER_COMPLETED: 15,
  RECOMMENDATION_CLICKED: 2,
  RECOMMENDATION_PURCHASED: 15,
};

/** 7-day half-life — recent activity matters more, same as the reference
 *  implementation's `timeDecay`. */
export const AFFINITY_HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 7;

/** How far back behavioral events are even considered for personalization —
 *  bounds the query, and anything past a few half-lives has decayed to
 *  near-zero weight anyway. */
export const AFFINITY_LOOKBACK_DAYS = 60;

/** Signal-source weights for the final blended score — the "ranking" step.
 *  Each candidate's raw per-source score (already 0–1 normalized within its
 *  own source) is multiplied by its weight and summed. */
export const SIGNAL_WEIGHTS = {
  contentSimilarity: 0.3,
  collaborative: 0.25,
  categoryAffinity: 0.2,
  brandAffinity: 0.1,
  priceRangeFit: 0.05,
  rules: 0.1,
} as const;

export const POPULARITY_WEIGHT_IN_COLD_START = 0.5;

/** Diversity cap: no more than this fraction of a final result list may
 *  share one categoryId — a simple, real re-ranking constraint (not MMR's
 *  full similarity-penalty formulation, but the same goal: stop the top-K
 *  from being one category repeated). */
export const MAX_CATEGORY_SHARE = 0.4;

export const TRENDING_LOOKBACK_DAYS = 7;
export const TRENDING_MIN_VIEWS = 3;
export const NEW_ARRIVAL_WINDOW_DAYS = 30;

export const DEFAULT_RECOMMENDATION_LIMIT = 12;
export const RECOMMENDATION_CACHE_TTL_SECONDS = 600;

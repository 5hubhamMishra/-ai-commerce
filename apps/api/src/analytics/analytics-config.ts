/**
 * Centralized constants for Phase 10 analytics — same "one place to tune,
 * not scattered magic numbers" precedent as recommendations/
 * recommendation-config.ts and search/search-config.ts.
 */

/** Default lookback window for demand forecasting's two-window
 *  moving-average-with-trend method (see DemandForecastingService) — long
 *  enough to smooth day-to-day noise, short enough to react to a real
 *  recent shift in sales. */
export const DEMAND_FORECAST_LOOKBACK_DAYS = 90;

export const DEMAND_FORECAST_DEFAULT_LIMIT = 50;

/** Stockout risk thresholds, in projected days of remaining stock at a
 *  variant's recent-half daily sales rate (see InventoryPredictionService). */
export const STOCKOUT_CRITICAL_DAYS = 7;
export const STOCKOUT_WARNING_DAYS = 21;

export const INVENTORY_RISK_DEFAULT_LIMIT = 50;

/** Insight-generation thresholds — each one names the exact real metric and
 *  cutoff that triggers a business insight (see BusinessInsightsService).
 *  Nothing there is freely generated text: every message is a template
 *  filled with a real, computed number, and these are the only decision
 *  points for which template fires. */
export const INSIGHT_LOW_REPEAT_BUYER_SHARE = 0.1;
export const INSIGHT_MIN_PROFILES_FOR_SEGMENT_INSIGHT = 5;
export const INSIGHT_HIGH_ZERO_RESULT_RATE = 0.2;
export const INSIGHT_HIGH_SHOPAI_REFUSAL_RATE = 0.1;

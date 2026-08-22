/** Matches `SegmentationReport` in apps/api/src/analytics/segmentation.service.ts. */
export type SegmentationReport = {
  totalProfiles: number;
  bySegment: { segment: string; count: number; share: number }[];
  byLifecycleStage: { stage: string; count: number; share: number }[];
};

/** Matches `VariantDemandForecast` in apps/api/src/analytics/demand-forecasting.service.ts. */
export type VariantDemandForecast = {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  lookbackDays: number;
  unitsSoldEarlierHalf: number;
  unitsSoldRecentHalf: number;
  dailyRateEarlierHalf: number;
  dailyRateRecentHalf: number;
  trend: "increasing" | "decreasing" | "stable" | "no_data";
  dataSufficient: boolean;
  projectedDailyRate: number;
};

/** Matches `StockoutRisk` in apps/api/src/analytics/inventory-prediction.service.ts — only
 *  `riskLevel !== 'ok'` rows are ever returned. */
export type StockoutRisk = {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  availableUnits: number;
  reorderPoint: number;
  belowReorderPoint: boolean;
  dailyRate: number;
  dataSufficient: boolean;
  daysUntilStockout: number | null;
  riskLevel: "critical" | "warning";
};

/** Matches `BusinessInsight` in apps/api/src/analytics/business-insights.service.ts — every
 *  insight is a deterministic template over real computed numbers, never LLM-generated. */
export type BusinessInsight = {
  id: string;
  category: "customers" | "inventory" | "recommendations" | "search" | "shopai";
  severity: "info" | "warning" | "critical";
  message: string;
  metrics: Record<string, number | null>;
};

/** Matches `EvaluationReport` — apps/api/src/recommendations `GET /recommendations/admin/evaluate`. */
export type RecommendationEvaluationReport = {
  catalog: { purchasableProducts: number };
  coverage: { productCoverage: number; categoryCoverage: number; totalImpressions: number };
  engagement: {
    clickThroughRate: number | null;
    conversionRate: number | null;
    distinctImpressionPairs: number;
  };
  offlineBacktest: { k: number; eligibleUsers: number; hitRateAtK: number | null };
};

/** Matches `SearchAnalyticsReport` — apps/api/src/search `GET /search/admin/analytics`. */
export type SearchAnalyticsReport = {
  windowDays: number;
  totalSearches: number;
  zeroResultSearches: number;
  zeroResultRate: number;
  semanticUsageRate: number;
  topQueries: { query: string; count: number }[];
  topZeroResultQueries: { query: string; count: number }[];
};

/** Matches `ShopAIAnalyticsReport` — apps/api/src/shopai `GET /shopai/admin/analytics`. Reads
 *  already-logged interactions, so it works (returns honest zeros) even if ShopAI's LLM calls
 *  themselves are currently failing for an unrelated reason (e.g. provider billing). */
export type ShopAIAnalyticsReport = {
  windowDays: number;
  totalInteractions: number;
  refusalRate: number;
  avgToolCallsPerInteraction: number;
  avgLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  topTools: { name: string; count: number }[];
};

/** Matches `GET /analytics/admin/dashboard`'s combined payload — the single "give me
 *  everything" call, each sub-report using its own default window/limit (no query params
 *  accepted on this endpoint itself). */
export type AdminDashboardReport = {
  segmentation: SegmentationReport;
  topStockoutRisks: StockoutRisk[];
  recommendations: RecommendationEvaluationReport;
  search: SearchAnalyticsReport;
  shopai: ShopAIAnalyticsReport;
  insights: BusinessInsight[];
};

export type DemandForecastQuery = { lookbackDays?: number; limit?: number };
export type InventoryRiskQuery = { lookbackDays?: number; limit?: number };
export type VariantForecastQuery = { lookbackDays?: number };
export type EvaluateQuery = { k?: number };
export type AnalyticsWindowQuery = { windowDays?: number };

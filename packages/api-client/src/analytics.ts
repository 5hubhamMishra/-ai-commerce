import type {
  AdminDashboardReport,
  DemandForecastQuery,
  InventoryRiskQuery,
  SegmentationReport,
  StockoutRisk,
  BusinessInsight,
  VariantDemandForecast,
  VariantForecastQuery,
} from '@ai-commerce/types';
import { request, toQueryString } from './http';

/** All routes here require ANALYST/ADMIN/SUPER_ADMIN (inventory-risk also allows
 *  INVENTORY_MANAGER) — a caller lacking the role gets a plain 403 `ApiError`, not a
 *  network-style failure. `getDashboard` is the one "give me everything" call: combined
 *  segmentation + top-10 stockout risks + recommendation/search/shopai health + insights,
 *  each sub-report using its own default window (no query params on this endpoint itself). */
export const analyticsApi = {
  getDashboard: () => request<AdminDashboardReport>('/analytics/admin/dashboard'),

  getSegmentation: () => request<SegmentationReport>('/analytics/admin/segmentation'),

  getDemandForecast: (query: DemandForecastQuery = {}) =>
    request<VariantDemandForecast[]>(`/analytics/admin/demand-forecast${toQueryString(query)}`),

  getVariantDemandForecast: (variantId: string, query: VariantForecastQuery = {}) =>
    request<VariantDemandForecast>(
      `/analytics/admin/demand-forecast/${encodeURIComponent(variantId)}${toQueryString(query)}`,
    ),

  getInventoryRisk: (query: InventoryRiskQuery = {}) =>
    request<StockoutRisk[]>(`/analytics/admin/inventory-risk${toQueryString(query)}`),

  getInsights: () => request<BusinessInsight[]>('/analytics/admin/insights'),
};

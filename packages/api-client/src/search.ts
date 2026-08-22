import type { AnalyticsWindowQuery, SearchAnalyticsReport, SearchQuery, SearchResponse } from '@ai-commerce/types';
import { request, toQueryString } from './http';

export const searchApi = {
  search: (query: SearchQuery = {}) =>
    request<SearchResponse>(`/search${toQueryString(query)}`),

  /** ANALYST/ADMIN/SUPER_ADMIN — query volume, zero-result rate, top queries. */
  getAdminAnalytics: (query: AnalyticsWindowQuery = {}) =>
    request<SearchAnalyticsReport>(`/search/admin/analytics${toQueryString(query)}`),
};

import type {
  EvaluateQuery,
  ListRecommendationsQuery,
  RecommendationEvaluationReport,
  ScoredProduct,
} from '@ai-commerce/types';
import { request, toQueryString } from './http';

export const recommendationsApi = {
  /** Personalized hybrid feed — works for anonymous callers too (degrades to a
   *  popularity-weighted cold-start ranking with no history). */
  list: (query: ListRecommendationsQuery = {}) =>
    request<ScoredProduct[]>(`/recommendations${toQueryString(query)}`),

  trending: (query: ListRecommendationsQuery = {}) =>
    request<ScoredProduct[]>(`/recommendations/trending${toQueryString(query)}`),

  similar: (productId: string, query: ListRecommendationsQuery = {}) =>
    request<ScoredProduct[]>(
      `/recommendations/similar/${encodeURIComponent(productId)}${toQueryString(query)}`,
    ),

  frequentlyBoughtWith: (productId: string, query: ListRecommendationsQuery = {}) =>
    request<ScoredProduct[]>(
      `/recommendations/frequently-bought-with/${encodeURIComponent(productId)}${toQueryString(query)}`,
    ),

  /** ANALYST/ADMIN/SUPER_ADMIN — coverage/engagement/offline-backtest health metrics. */
  getAdminEvaluation: (query: EvaluateQuery = {}) =>
    request<RecommendationEvaluationReport>(`/recommendations/admin/evaluate${toQueryString(query)}`),
};

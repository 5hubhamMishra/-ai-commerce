import type { ComparisonResponse } from '@ai-commerce/types';
import { request, toQueryString } from './http';

export const comparisonApi = {
  /** 2-4 unique product ids. Public — no auth required. Throws `ApiError` (400,
   *  `PRODUCT_NOT_COMPARABLE`) if any id doesn't resolve to an active product. */
  compare: (ids: string[]) => request<ComparisonResponse>(`/comparison${toQueryString({ ids: ids.join(',') })}`),
};

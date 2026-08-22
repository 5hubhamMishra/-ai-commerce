import type { SearchQuery, SearchResponse } from '@ai-commerce/types';
import { request, toQueryString } from './http';

export const searchApi = {
  search: (query: SearchQuery = {}) =>
    request<SearchResponse>(`/search${toQueryString(query)}`),
};

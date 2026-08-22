import type { BrandSummary, CategorySummary } from './catalog';

/** Matches `toSearchItem()` in apps/api/src/search/search.service.ts — deliberately
 *  distinct from `ProductListItem`: no `status`/`isFeatured`/`seller`. */
export type SearchResultItem = {
  id: string;
  slug: string;
  name: string;
  category: CategorySummary;
  brand: BrandSummary | null;
  currency: string;
  minPrice: number | null;
  maxPrice: number | null;
  primaryImageUrl: string | null;
  inStock: boolean;
};

/** Null when the query has no free-text `q` (pure filter/sort, no query understanding ran). */
export type SearchUnderstood = {
  category: string | null;
  brand: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  attributes: string[];
} | null;

export type SearchResponse = {
  items: SearchResultItem[];
  total: number;
  page: number;
  pageSize: number;
  understood: SearchUnderstood;
};

/** Matches SEARCH_SORT_OPTIONS in apps/api/src/search/dto/search-query.dto.ts. */
export type SearchSort = 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'name_asc';

export type SearchQuery = {
  q?: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: SearchSort;
  page?: number;
  pageSize?: number;
  anonymousId?: string;
};

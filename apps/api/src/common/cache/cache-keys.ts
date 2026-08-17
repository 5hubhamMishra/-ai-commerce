/** Shared cache key prefixes — used both when writing cache entries and when
 *  invalidating them, so the two never drift apart. */
export const CACHE_PREFIX = {
  CATEGORIES: 'catalog:categories:',
  BRANDS: 'catalog:brands:',
  PRODUCTS: 'catalog:products:',
} as const;

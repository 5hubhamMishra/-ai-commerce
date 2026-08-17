export const CATALOG_EVENTS = {
  CATEGORY_CHANGED: 'catalog.category.changed',
  BRAND_CHANGED: 'catalog.brand.changed',
  PRODUCT_CHANGED: 'catalog.product.changed',
  INVENTORY_CHANGED: 'catalog.inventory.changed',
} as const;

export type CatalogChangeAction = 'created' | 'updated' | 'deleted';

export type CatalogEntityType = 'category' | 'brand' | 'product' | 'inventory';

export type CatalogChangeEvent = {
  entityType: CatalogEntityType;
  entityId: string;
  /** For inventory events, the product the affected variant belongs to — lets
   *  listeners invalidate just that product's cached detail instead of everything. */
  productId?: string;
  action: CatalogChangeAction;
};

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CACHE_PREFIX } from '../cache/cache-keys';
import { CacheService } from '../cache/cache.service';
import { CATALOG_EVENTS } from './catalog-events.types';

/** Busts the read cache for whichever catalog domain just changed. */
@Injectable()
export class CatalogCacheInvalidationListener {
  constructor(private readonly cache: CacheService) {}

  @OnEvent(CATALOG_EVENTS.CATEGORY_CHANGED)
  async onCategoryChanged() {
    await this.cache.delByPrefix(CACHE_PREFIX.CATEGORIES);
  }

  @OnEvent(CATALOG_EVENTS.BRAND_CHANGED)
  async onBrandChanged() {
    await this.cache.delByPrefix(CACHE_PREFIX.BRANDS);
  }

  @OnEvent(CATALOG_EVENTS.PRODUCT_CHANGED)
  async onProductChanged() {
    await Promise.all([
      this.cache.delByPrefix(CACHE_PREFIX.PRODUCTS),
      this.cache.delByPrefix(CACHE_PREFIX.RECOMMENDATIONS),
    ]);
  }

  @OnEvent(CATALOG_EVENTS.INVENTORY_CHANGED)
  async onInventoryChanged() {
    // Inventory changes affect availability shown on product list/detail responses.
    await Promise.all([
      this.cache.delByPrefix(CACHE_PREFIX.PRODUCTS),
      this.cache.delByPrefix(CACHE_PREFIX.RECOMMENDATIONS),
    ]);
  }
}

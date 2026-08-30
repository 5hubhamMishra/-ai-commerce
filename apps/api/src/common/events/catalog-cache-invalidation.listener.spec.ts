import { CacheService } from '../cache/cache.service';
import { CACHE_PREFIX } from '../cache/cache-keys';
import { CatalogCacheInvalidationListener } from './catalog-cache-invalidation.listener';

describe('CatalogCacheInvalidationListener', () => {
  it('clears recommendation caches when inventory changes', async () => {
    const cache = {
      delByPrefix: jest.fn().mockResolvedValue(undefined),
    };
    const listener = new CatalogCacheInvalidationListener(
      cache as unknown as CacheService,
    );

    await listener.onInventoryChanged();

    expect(cache.delByPrefix).toHaveBeenCalledWith(CACHE_PREFIX.PRODUCTS);
    expect(cache.delByPrefix).toHaveBeenCalledWith(
      CACHE_PREFIX.RECOMMENDATIONS,
    );
  });

  it('clears recommendation caches when product data changes', async () => {
    const cache = {
      delByPrefix: jest.fn().mockResolvedValue(undefined),
    };
    const listener = new CatalogCacheInvalidationListener(
      cache as unknown as CacheService,
    );

    await listener.onProductChanged();

    expect(cache.delByPrefix).toHaveBeenCalledWith(CACHE_PREFIX.PRODUCTS);
    expect(cache.delByPrefix).toHaveBeenCalledWith(
      CACHE_PREFIX.RECOMMENDATIONS,
    );
  });
});

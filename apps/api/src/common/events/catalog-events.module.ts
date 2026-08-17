import { Global, Module } from '@nestjs/common';
import { CatalogCacheInvalidationListener } from './catalog-cache-invalidation.listener';
import { CatalogEmbeddingHookListener } from './catalog-embedding-hook.listener';
import { CatalogEventsService } from './catalog-events.service';
import { CatalogSearchHookListener } from './catalog-search-hook.listener';

@Global()
@Module({
  providers: [
    CatalogEventsService,
    CatalogCacheInvalidationListener,
    CatalogSearchHookListener,
    CatalogEmbeddingHookListener,
  ],
  exports: [CatalogEventsService],
})
export class CatalogEventsModule {}

import { Global, Module } from '@nestjs/common';
import { EmbeddingsModule } from '../../embeddings/embeddings.module';
import { CatalogCacheInvalidationListener } from './catalog-cache-invalidation.listener';
import { CatalogEmbeddingHookListener } from './catalog-embedding-hook.listener';
import { CatalogEventsService } from './catalog-events.service';

@Global()
@Module({
  imports: [EmbeddingsModule],
  providers: [
    CatalogEventsService,
    CatalogCacheInvalidationListener,
    CatalogEmbeddingHookListener,
  ],
  exports: [CatalogEventsService],
})
export class CatalogEventsModule {}

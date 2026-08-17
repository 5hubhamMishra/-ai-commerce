import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CATALOG_EVENTS } from './catalog-events.types';
import type { CatalogChangeEvent } from './catalog-events.types';

/**
 * Hook point for embedding regeneration (Phase 8/9 — pgvector similarity + semantic
 * search, per docs/AI_ARCHITECTURE.md "regenerated on product create/update"). Only
 * product changes matter here — categories/brands/inventory don't have embeddings.
 * Logs for now; becomes the real trigger into the embedding worker once it exists.
 */
@Injectable()
export class CatalogEmbeddingHookListener {
  private readonly logger = new Logger('EmbeddingUpdateHook');

  @OnEvent(CATALOG_EVENTS.PRODUCT_CHANGED)
  onProductChanged(event: CatalogChangeEvent) {
    if (event.action === 'deleted') return;
    this.logger.log(
      `embedding regeneration pending: product ${event.entityId}`,
    );
  }
}

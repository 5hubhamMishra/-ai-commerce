import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmbeddingsService } from '../../embeddings/embeddings.service';
import { CATALOG_EVENTS } from './catalog-events.types';
import type { CatalogChangeEvent } from './catalog-events.types';

/**
 * Hook point for embedding regeneration — real since Phase 7 (was a log-only
 * stub through Phase 2–6, per docs/AI_ARCHITECTURE.md "regenerated on
 * product create/update"). Only product changes matter here —
 * categories/brands/inventory don't have embeddings. `reindexProduct` itself
 * handles the `deleted` case (drops the stale embedding), so this listener
 * doesn't special-case it — exactly the "real hook point, stubbed body, fill
 * in later" precedent (ADR-010/EVENTS.md) finally being realized, same as
 * OrderNotificationHookListener's Phase 4 upgrade.
 */
@Injectable()
export class CatalogEmbeddingHookListener {
  private readonly logger = new Logger('EmbeddingUpdateHook');

  constructor(private readonly embeddings: EmbeddingsService) {}

  @OnEvent(CATALOG_EVENTS.PRODUCT_CHANGED)
  async onProductChanged(event: CatalogChangeEvent) {
    try {
      await this.embeddings.reindexProduct(event.entityId);
    } catch (error) {
      // A failed reindex shouldn't be able to affect the catalog write that
      // triggered it — this listener runs after that write already
      // committed (see CatalogEventsService), so the worst case here is a
      // stale/missing embedding, not a lost catalog change.
      this.logger.warn(
        `Failed to reindex embedding for product ${event.entityId}: ${String(error)}`,
      );
    }
  }
}

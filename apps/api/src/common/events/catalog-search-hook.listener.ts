import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CATALOG_EVENTS } from './catalog-events.types';
import type { CatalogChangeEvent } from './catalog-events.types';

/**
 * Hook point for the search indexer (Phase 8 — Semantic Search is explicitly out of
 * scope for Phase 2). Every catalog change that affects what's searchable lands here;
 * for now it just logs a structured line documenting the hook fired. When the search
 * module exists it becomes the real subscriber to these same events — nothing about
 * how catalog services emit changes needs to change.
 */
@Injectable()
export class CatalogSearchHookListener {
  private readonly logger = new Logger('SearchIndexHook');

  @OnEvent([
    CATALOG_EVENTS.CATEGORY_CHANGED,
    CATALOG_EVENTS.BRAND_CHANGED,
    CATALOG_EVENTS.PRODUCT_CHANGED,
  ])
  onCatalogChanged(event: CatalogChangeEvent) {
    this.logger.log(
      `search index update pending: ${event.entityType} ${event.entityId} (${event.action})`,
    );
  }
}

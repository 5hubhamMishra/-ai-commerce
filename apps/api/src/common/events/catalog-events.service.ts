import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CATALOG_EVENTS,
  CatalogChangeAction,
  CatalogChangeEvent,
} from './catalog-events.types';

/**
 * Single emission point for catalog domain events. Services call this instead of
 * touching EventEmitter2 directly, so every listener (cache invalidation, and the
 * search/embedding hook points below) reacts to the same event shape.
 */
@Injectable()
export class CatalogEventsService {
  constructor(private readonly emitter: EventEmitter2) {}

  categoryChanged(entityId: string, action: CatalogChangeAction) {
    this.emit(
      { entityType: 'category', entityId, action },
      CATALOG_EVENTS.CATEGORY_CHANGED,
    );
  }

  brandChanged(entityId: string, action: CatalogChangeAction) {
    this.emit(
      { entityType: 'brand', entityId, action },
      CATALOG_EVENTS.BRAND_CHANGED,
    );
  }

  productChanged(entityId: string, action: CatalogChangeAction) {
    this.emit(
      { entityType: 'product', entityId, action },
      CATALOG_EVENTS.PRODUCT_CHANGED,
    );
  }

  inventoryChanged(
    entityId: string,
    productId: string,
    action: CatalogChangeAction,
  ) {
    this.emit(
      { entityType: 'inventory', entityId, productId, action },
      CATALOG_EVENTS.INVENTORY_CHANGED,
    );
  }

  private emit(payload: CatalogChangeEvent, eventName: string) {
    this.emitter.emit(eventName, payload);
  }
}

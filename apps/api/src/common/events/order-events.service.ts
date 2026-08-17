import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { OrderStatus } from '@prisma/client';
import {
  ORDER_EVENTS,
  OrderCreatedEvent,
  OrderStatusChangedEvent,
  PaymentEvent,
} from './order-events.types';

/**
 * Single emission point for order domain events, mirroring CatalogEventsService's
 * pattern exactly — one typed method per event, one place that touches EventEmitter2.
 */
@Injectable()
export class OrderEventsService {
  constructor(private readonly emitter: EventEmitter2) {}

  orderCreated(orderId: string, userId: string) {
    this.emitter.emit(ORDER_EVENTS.ORDER_CREATED, {
      orderId,
      userId,
    } satisfies OrderCreatedEvent);
  }

  orderStatusChanged(
    orderId: string,
    userId: string,
    fromStatus: OrderStatus | null,
    toStatus: OrderStatus,
  ) {
    this.emitter.emit(ORDER_EVENTS.ORDER_STATUS_CHANGED, {
      orderId,
      userId,
      fromStatus,
      toStatus,
    } satisfies OrderStatusChangedEvent);
  }

  paymentSucceeded(orderId: string, paymentId: string, userId: string) {
    this.emitter.emit(ORDER_EVENTS.PAYMENT_SUCCEEDED, {
      orderId,
      paymentId,
      userId,
    } satisfies PaymentEvent);
  }

  paymentFailed(orderId: string, paymentId: string, userId: string) {
    this.emitter.emit(ORDER_EVENTS.PAYMENT_FAILED, {
      orderId,
      paymentId,
      userId,
    } satisfies PaymentEvent);
  }
}

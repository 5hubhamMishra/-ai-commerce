import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ORDER_EVENTS } from './order-events.types';
import type {
  OrderCreatedEvent,
  OrderStatusChangedEvent,
  PaymentEvent,
} from './order-events.types';

/**
 * Hook point for customer notifications (Phase 4/6+ territory — no email/SMS/push
 * infrastructure exists yet). Every order/payment event that should eventually
 * trigger a notification lands here; for now it just logs a structured line, same
 * precedent as CatalogSearchHookListener/CatalogEmbeddingHookListener in Phase 2.
 */
@Injectable()
export class OrderNotificationHookListener {
  private readonly logger = new Logger('OrderNotificationHook');

  @OnEvent(ORDER_EVENTS.ORDER_CREATED)
  onOrderCreated(event: OrderCreatedEvent) {
    this.logger.log(`notification pending: order ${event.orderId} created`);
  }

  @OnEvent(ORDER_EVENTS.ORDER_STATUS_CHANGED)
  onOrderStatusChanged(event: OrderStatusChangedEvent) {
    this.logger.log(
      `notification pending: order ${event.orderId} ${event.fromStatus ?? '(new)'} -> ${event.toStatus}`,
    );
  }

  @OnEvent(ORDER_EVENTS.PAYMENT_SUCCEEDED)
  onPaymentSucceeded(event: PaymentEvent) {
    this.logger.log(
      `notification pending: payment ${event.paymentId} succeeded for order ${event.orderId}`,
    );
  }

  @OnEvent(ORDER_EVENTS.PAYMENT_FAILED)
  onPaymentFailed(event: PaymentEvent) {
    this.logger.log(
      `notification pending: payment ${event.paymentId} failed for order ${event.orderId}`,
    );
  }
}

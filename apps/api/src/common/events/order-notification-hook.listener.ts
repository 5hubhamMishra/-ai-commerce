import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../../notifications/notifications.service';
import { ORDER_EVENTS } from './order-events.types';
import type {
  OrderCreatedEvent,
  OrderStatusChangedEvent,
  PaymentEvent,
} from './order-events.types';

/**
 * Real in-app notifications for order/payment events (Phase 4 — upgraded from
 * Phase 3's log-only stub now that NotificationsService exists). External
 * channels (email/SMS/push) remain a documented gap — see DATABASE.md.
 */
@Injectable()
export class OrderNotificationHookListener {
  private readonly logger = new Logger('OrderNotificationHook');

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(ORDER_EVENTS.ORDER_CREATED)
  async onOrderCreated(event: OrderCreatedEvent) {
    await this.createNotification(
      event,
      NotificationType.ORDER_STATUS,
      'Order placed',
      'Your order has been placed and is awaiting payment.',
    );
  }

  @OnEvent(ORDER_EVENTS.ORDER_STATUS_CHANGED)
  async onOrderStatusChanged(event: OrderStatusChangedEvent) {
    await this.createNotification(
      event,
      NotificationType.ORDER_STATUS,
      'Order status updated',
      `Your order is now ${humanize(event.toStatus)}.`,
    );
  }

  @OnEvent(ORDER_EVENTS.PAYMENT_SUCCEEDED)
  async onPaymentSucceeded(event: PaymentEvent) {
    await this.createNotification(
      event,
      NotificationType.PAYMENT,
      'Payment successful',
      'Your payment was successful and your order is confirmed.',
    );
  }

  @OnEvent(ORDER_EVENTS.PAYMENT_FAILED)
  async onPaymentFailed(event: PaymentEvent) {
    await this.createNotification(
      event,
      NotificationType.PAYMENT,
      'Payment failed',
      'Your payment could not be completed. Please try again.',
    );
    this.logger.log(
      `payment ${event.paymentId} failed for order ${event.orderId}`,
    );
  }

  private async createNotification(
    event: OrderCreatedEvent | OrderStatusChangedEvent | PaymentEvent,
    type: NotificationType,
    title: string,
    body: string,
  ) {
    try {
      await this.notifications.create(
        event.userId,
        type,
        title,
        body,
        'order',
        event.orderId,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to create ${type} notification for order ${event.orderId}: ${String(error)}`,
      );
    }
  }
}

function humanize(status: string): string {
  return status.replace(/_/g, ' ').toLowerCase();
}

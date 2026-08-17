import type { OrderStatus } from '@prisma/client';

export const ORDER_EVENTS = {
  ORDER_CREATED: 'order.created',
  ORDER_STATUS_CHANGED: 'order.status.changed',
  PAYMENT_SUCCEEDED: 'order.payment.succeeded',
  PAYMENT_FAILED: 'order.payment.failed',
} as const;

export type OrderCreatedEvent = {
  orderId: string;
  userId: string;
};

export type OrderStatusChangedEvent = {
  orderId: string;
  userId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
};

export type PaymentEvent = {
  orderId: string;
  paymentId: string;
  userId: string;
};

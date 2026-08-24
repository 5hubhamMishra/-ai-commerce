import { Logger } from '@nestjs/common';
import { NotificationType, OrderStatus } from '@prisma/client';
import { NotificationsService } from '../../notifications/notifications.service';
import { OrderNotificationHookListener } from './order-notification-hook.listener';

describe('OrderNotificationHookListener', () => {
  let notifications: { create: jest.Mock };
  let listener: OrderNotificationHookListener;

  beforeEach(() => {
    notifications = { create: jest.fn().mockResolvedValue({}) };
    listener = new OrderNotificationHookListener(
      notifications as unknown as NotificationsService,
    );
  });

  it('creates an in-app notification for order status changes', async () => {
    await listener.onOrderStatusChanged({
      orderId: 'order1',
      userId: 'user1',
      fromStatus: OrderStatus.PROCESSING,
      toStatus: OrderStatus.SHIPPED,
    });

    expect(notifications.create).toHaveBeenCalledWith(
      'user1',
      NotificationType.ORDER_STATUS,
      'Order status updated',
      'Your order is now shipped.',
      'order',
      'order1',
    );
  });

  it('does not throw when notification persistence fails', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    notifications.create.mockRejectedValue(new Error('database unavailable'));

    await expect(
      listener.onPaymentSucceeded({
        orderId: 'order1',
        paymentId: 'payment1',
        userId: 'user1',
      }),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to create PAYMENT notification for order order1',
      ),
    );
    warnSpy.mockRestore();
  });
});

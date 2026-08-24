import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_CHANNEL_PROVIDER } from './channels/notification-channel-provider.token';
import type { NotificationChannelProvider } from './channels/notification-channel.types';
import { DisabledNotificationChannelProvider } from './channels/disabled-notification-channel.provider';
import { NotificationDeliveryService } from './notification-delivery.service';

describe('NotificationDeliveryService', () => {
  let prisma: {
    notificationDeliveryAttempt: { create: jest.Mock };
  };

  async function build(provider: NotificationChannelProvider) {
    prisma = {
      notificationDeliveryAttempt: { create: jest.fn().mockResolvedValue({}) },
    };
    const module = await Test.createTestingModule({
      providers: [
        NotificationDeliveryService,
        { provide: PrismaService, useValue: prisma },
        { provide: NOTIFICATION_CHANNEL_PROVIDER, useValue: provider },
      ],
    }).compile();
    return module.get(NotificationDeliveryService);
  }

  const message = {
    notificationId: 'notification1',
    userId: 'user1',
    type: 'ORDER_STATUS',
    title: 'Order placed',
    body: 'Your order has been placed.',
    relatedType: 'order',
    relatedId: 'order1',
  };

  it('records skipped attempts for the disabled default provider', async () => {
    const service = await build(new DisabledNotificationChannelProvider());

    await service.dispatch(['EMAIL', 'EMAIL', 'PUSH'], message);

    expect(prisma.notificationDeliveryAttempt.create).toHaveBeenCalledTimes(2);
    expect(prisma.notificationDeliveryAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        notificationId: 'notification1',
        channel: 'EMAIL',
        status: 'SKIPPED',
        provider: 'disabled',
        errorCode: 'CHANNEL_DISABLED',
      }),
    });
    expect(prisma.notificationDeliveryAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        notificationId: 'notification1',
        channel: 'PUSH',
        status: 'SKIPPED',
        provider: 'disabled',
        errorCode: 'CHANNEL_DISABLED',
      }),
    });
  });

  it('records provider exceptions as failed attempts', async () => {
    const provider: NotificationChannelProvider = {
      name: 'test-provider',
      deliver: jest.fn().mockRejectedValue(new Error('provider unavailable')),
    };
    const service = await build(provider);

    await expect(service.dispatch(['SMS'], message)).resolves.toBeUndefined();

    expect(prisma.notificationDeliveryAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        notificationId: 'notification1',
        channel: 'SMS',
        status: 'FAILED',
        provider: 'test-provider',
        errorCode: 'PROVIDER_ERROR',
        errorMessage: 'provider unavailable',
      }),
    });
  });
});

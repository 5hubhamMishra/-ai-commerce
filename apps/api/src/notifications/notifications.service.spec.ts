import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let delivery: { dispatch: jest.Mock };
  let prisma: {
    notification: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    delivery = { dispatch: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      notification: {
        create: jest.fn().mockResolvedValue({
          id: 'notification1',
          userId: 'user1',
          type: NotificationType.ORDER_STATUS,
          title: 'Order placed',
          body: 'Your order has been placed.',
          relatedType: 'order',
          relatedId: 'order1',
        }),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationDeliveryService, useValue: delivery },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  it('creates an in-app notification without external delivery by default', async () => {
    await service.create(
      'user1',
      NotificationType.ORDER_STATUS,
      'Order placed',
      'Your order has been placed.',
      'order',
      'order1',
    );

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'user1',
        type: NotificationType.ORDER_STATUS,
        title: 'Order placed',
        body: 'Your order has been placed.',
        relatedType: 'order',
        relatedId: 'order1',
      },
    });
    expect(delivery.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches requested external channels after creating the in-app notification', async () => {
    await service.create(
      'user1',
      NotificationType.ORDER_STATUS,
      'Order placed',
      'Your order has been placed.',
      'order',
      'order1',
      { channels: ['EMAIL'] },
    );

    expect(delivery.dispatch).toHaveBeenCalledWith(['EMAIL'], {
      notificationId: 'notification1',
      userId: 'user1',
      type: NotificationType.ORDER_STATUS,
      title: 'Order placed',
      body: 'Your order has been placed.',
      relatedType: 'order',
      relatedId: 'order1',
    });
  });

  it('fails open when notification persistence is unavailable', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    prisma.notification.create.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(
      service.create(
        'user1',
        NotificationType.ORDER_STATUS,
        'Order placed',
        'Your order has been placed.',
      ),
    ).resolves.toBeNull();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to create notification for user user1'),
    );
    warnSpy.mockRestore();
  });

  it('maps a concurrent notification deletion to not found', async () => {
    prisma.notification.findUnique.mockResolvedValue({
      id: 'notification1',
      userId: 'user1',
      readAt: null,
    });
    prisma.notification.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.markRead('user1', 'notification1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NOTIFICATION_NOT_FOUND' }),
    });
  });
});

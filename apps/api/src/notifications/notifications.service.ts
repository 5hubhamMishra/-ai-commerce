import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Real in-app notification center. Called directly (like AuditService) by any
 * domain service that needs to notify a user of something synchronous and
 * user-visible — order/payment status changes (via OrderNotificationHookListener),
 * return/refund/replacement/exchange milestones, support replies. External
 * channels (email/SMS/push) are a documented gap: they need a provider
 * integration this phase doesn't add, same "adapter later" precedent as
 * payments/shipping — see DATABASE.md.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    relatedType?: string,
    relatedId?: string,
  ) {
    return this.prisma.notification.create({
      data: { userId, type, title, body, relatedType, relatedId },
    });
  }

  async listForUser(userId: string, unreadOnly: boolean) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Notification not found.',
      });
    }
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: notification.readAt ?? new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}

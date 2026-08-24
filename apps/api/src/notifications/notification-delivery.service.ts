import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_CHANNEL_PROVIDER } from './channels/notification-channel-provider.token';
import type {
  NotificationChannel,
  NotificationChannelProvider,
  NotificationDeliveryMessage,
  NotificationDeliveryResult,
} from './channels/notification-channel.types';

type DeliveryAttemptDelegate = {
  create(args: {
    data: {
      notificationId: string;
      channel: NotificationChannel;
      status: NotificationDeliveryResult['status'];
      provider?: string;
      providerMessageId?: string;
      errorCode?: string;
      errorMessage?: string;
    };
  }): Promise<unknown>;
};

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_CHANNEL_PROVIDER)
    private readonly provider: NotificationChannelProvider,
  ) {}

  async dispatch(
    channels: NotificationChannel[],
    message: NotificationDeliveryMessage,
  ) {
    const uniqueChannels = [...new Set(channels)];

    await Promise.all(
      uniqueChannels.map(async (channel) => {
        const result = await this.deliver(channel, message);
        await this.attempts.create({
          data: {
            notificationId: message.notificationId,
            channel,
            status: result.status,
            provider: result.provider ?? this.provider.name,
            providerMessageId: result.providerMessageId,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
          },
        });
      }),
    );
  }

  private async deliver(
    channel: NotificationChannel,
    message: NotificationDeliveryMessage,
  ): Promise<NotificationDeliveryResult> {
    try {
      return await this.provider.deliver(channel, message);
    } catch (error) {
      const messageText = (error as Error).message;
      this.logger.warn(
        `Notification ${message.notificationId} ${channel} delivery failed: ${messageText}`,
      );
      return {
        status: 'FAILED',
        provider: this.provider.name,
        errorCode: 'PROVIDER_ERROR',
        errorMessage: messageText,
      };
    }
  }

  private get attempts(): DeliveryAttemptDelegate {
    return (
      this.prisma as unknown as {
        notificationDeliveryAttempt: DeliveryAttemptDelegate;
      }
    ).notificationDeliveryAttempt;
  }
}

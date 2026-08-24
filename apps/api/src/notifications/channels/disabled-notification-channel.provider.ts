import { Injectable } from '@nestjs/common';
import type {
  NotificationChannel,
  NotificationChannelProvider,
  NotificationDeliveryResult,
} from './notification-channel.types';

@Injectable()
export class DisabledNotificationChannelProvider implements NotificationChannelProvider {
  readonly name = 'disabled';

  deliver(channel: NotificationChannel): Promise<NotificationDeliveryResult> {
    return Promise.resolve({
      status: 'SKIPPED',
      provider: this.name,
      errorCode: 'CHANNEL_DISABLED',
      errorMessage: `${channel.toLowerCase()} notifications are not configured.`,
    });
  }
}

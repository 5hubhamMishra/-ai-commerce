import { Global, Module } from '@nestjs/common';
import { DisabledNotificationChannelProvider } from './channels/disabled-notification-channel.provider';
import { NOTIFICATION_CHANNEL_PROVIDER } from './channels/notification-channel-provider.token';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

// Global like AuditService/CacheService — nearly every Phase 4 domain service
// (returns, refunds, replacements, exchanges, support) needs to notify a user
// of something, so requiring every one of those modules to import this one
// individually would be pure boilerplate.
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationDeliveryService,
    {
      provide: NOTIFICATION_CHANNEL_PROVIDER,
      useClass: DisabledNotificationChannelProvider,
    },
  ],
  exports: [NotificationsService, NotificationDeliveryService],
})
export class NotificationsModule {}

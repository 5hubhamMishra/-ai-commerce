export const NOTIFICATION_CHANNELS = ['EMAIL', 'SMS', 'PUSH'] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type NotificationDeliveryStatus = 'SENT' | 'SKIPPED' | 'FAILED';

export type NotificationDeliveryMessage = {
  notificationId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  relatedType?: string;
  relatedId?: string;
};

export type NotificationDeliveryResult = {
  status: NotificationDeliveryStatus;
  provider?: string;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
};

export interface NotificationChannelProvider {
  readonly name: string;
  deliver(
    channel: NotificationChannel,
    message: NotificationDeliveryMessage,
  ): Promise<NotificationDeliveryResult>;
}

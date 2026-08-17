import { Global, Module } from '@nestjs/common';
import { OrderEventsService } from './order-events.service';
import { OrderNotificationHookListener } from './order-notification-hook.listener';

@Global()
@Module({
  providers: [OrderEventsService, OrderNotificationHookListener],
  exports: [OrderEventsService],
})
export class OrderEventsModule {}

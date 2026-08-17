import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

// Global like AuditService/CacheService — nearly every Phase 4 domain service
// (returns, refunds, replacements, exchanges, support) needs to notify a user
// of something, so requiring every one of those modules to import this one
// individually would be pure boilerplate.
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

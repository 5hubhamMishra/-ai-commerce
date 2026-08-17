import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { NotificationsService } from './notifications.service';

class ListNotificationsQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.listForUser(
      user.id,
      query.unreadOnly ?? false,
    );
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationsService.markRead(user.id, id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllRead(user.id);
  }
}

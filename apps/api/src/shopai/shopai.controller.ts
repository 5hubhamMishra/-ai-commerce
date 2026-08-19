import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { GetConversationQueryDto } from './dto/get-conversation-query.dto';
import { ShopAIAnalyticsQueryDto } from './dto/shopai-analytics-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ShopAIAnalyticsService } from './shopai-analytics.service';
import { ShopAIService, type ShopAIIdentity } from './shopai.service';

const ANALYTICS_ROLES = [Role.ANALYST, Role.ADMIN, Role.SUPER_ADMIN];

/** Public, but identifies a logged-in caller from a real, verified JWT when
 *  present — same OptionalJwtAuthGuard shape as search/recommendations/
 *  behavioral events. A rate limit tighter than the global default (100/min)
 *  applies specifically here: every message is a real, billed LLM call, not
 *  a cheap read. */
@Controller('shopai')
export class ShopAIController {
  constructor(
    private readonly shopai: ShopAIService,
    private readonly analytics: ShopAIAnalyticsService,
  ) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('message')
  sendMessage(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: SendMessageDto,
  ) {
    return this.shopai.sendMessage(
      { conversationId: dto.conversationId, message: dto.message },
      identityFor(user, dto.anonymousId),
    );
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('conversations/:id')
  getConversation(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') id: string,
    @Query() query: GetConversationQueryDto,
  ) {
    return this.shopai.getConversation(
      id,
      identityFor(user, query.anonymousId),
    );
  }

  @Roles(...ANALYTICS_ROLES)
  @Get('admin/analytics')
  getAnalytics(@Query() query: ShopAIAnalyticsQueryDto) {
    return this.analytics.getReport(query.windowDays);
  }
}

function identityFor(
  user: AuthenticatedUser | undefined,
  anonymousId?: string,
): ShopAIIdentity {
  return { authenticatedUser: user, anonymousId };
}

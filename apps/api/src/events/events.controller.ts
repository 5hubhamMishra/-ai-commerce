import { Role } from '@prisma/client';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ListActivityQueryDto } from './dto/list-activity-query.dto';
import { TrackEventsDto } from './dto/track-events.dto';
import { EventsService } from './events.service';

/** Public because anonymous tracking must work before login — see
 *  OptionalJwtAuthGuard for how a logged-in caller still gets identified. */
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post()
  @HttpCode(202)
  track(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: TrackEventsDto,
  ) {
    return this.eventsService.track(user?.id, dto);
  }

  @Roles(Role.ANALYST, Role.ADMIN, Role.SUPER_ADMIN)
  @Get('admin/aggregation-status')
  aggregationStatus() {
    return this.eventsService.getAggregationStatus();
  }
}

/** Privacy controls (spec PRIVACY: "activity history"; PROMPT 07 Verify:
 *  "privacy deletion behavior") — real authentication required, no
 *  optional-auth here; a user's own behavioral history is never anonymous. */
@Controller('users/me')
export class ActivityController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('activity')
  listActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListActivityQueryDto,
  ) {
    return this.eventsService.listActivity(
      user.id,
      query.page ?? 1,
      query.pageSize ?? 20,
    );
  }

  @Delete('activity')
  @HttpCode(204)
  async eraseActivity(@CurrentUser() user: AuthenticatedUser) {
    await this.eventsService.eraseActivity(user.id);
  }

  // Wrapped in an envelope rather than returning the bare result — Nest
  // treats a literal `null` controller return the same as `undefined` (an
  // empty response, no body at all), so "no profile yet" needs a real
  // object shape to be distinguishable from an actual empty/failed response.
  @Get('behavioral-profile')
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return { profile: await this.eventsService.getProfile(user.id) };
  }
}

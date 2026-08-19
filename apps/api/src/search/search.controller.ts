import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { SearchAnalyticsQueryDto } from './dto/search-analytics-query.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchAnalyticsService } from './search-analytics.service';
import { SearchService } from './search.service';

const ANALYTICS_ROLES = [Role.ANALYST, Role.ADMIN, Role.SUPER_ADMIN];

@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly analytics: SearchAnalyticsService,
  ) {}

  /** Public, but identifies a logged-in caller via a real JWT when present —
   *  same OptionalJwtAuthGuard shape as recommendations/behavioral events —
   *  so search analytics can attribute a search without blocking anonymous
   *  browsing. `anonymousId` is declared on the DTO itself, not read via a
   *  separate `@Query()`, to avoid Phase 7's forbidNonWhitelisted bug. */
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  search(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query() query: SearchQueryDto,
  ) {
    return this.searchService.search(query, {
      userId: user?.id,
      anonymousId: query.anonymousId,
    });
  }

  @Roles(...ANALYTICS_ROLES)
  @Get('admin/analytics')
  getAnalytics(@Query() query: SearchAnalyticsQueryDto) {
    return this.analytics.getReport(query.windowDays);
  }
}

import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { EvaluateQueryDto } from './dto/evaluate-query.dto';
import { ListRecommendationsQueryDto } from './dto/list-recommendations-query.dto';
import { EvaluationService } from './evaluation.service';
import {
  RecommendationsService,
  type Identity,
} from './recommendations.service';

const ADMIN_ROLES = [Role.ADMIN, Role.SUPER_ADMIN];
const ANALYTICS_ROLES = [Role.ANALYST, Role.ADMIN, Role.SUPER_ADMIN];

/** Anonymous browsing must still get recommendations — every read route is
 *  `@Public()` + `OptionalJwtAuthGuard` (same shape as Phase 6's event
 *  collector): identifies a logged-in caller from a real, verified JWT when
 *  one is present, never blocks when it isn't. The `anonymousId` a
 *  logged-out caller supplies is only ever used to *read* their own
 *  already-anonymous behavioral history back (see BehavioralScoringService)
 *  — it can't be used to see anyone else's data. */
@Controller('recommendations')
export class RecommendationsController {
  constructor(
    private readonly recommendations: RecommendationsService,
    private readonly evaluation: EvaluationService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  getPersonalized(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query() query: ListRecommendationsQueryDto,
  ) {
    return this.recommendations.getPersonalized(
      identityFor(user, query.anonymousId),
      query.limit,
    );
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('trending')
  getTrending(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query() query: ListRecommendationsQueryDto,
  ) {
    return this.recommendations.getTrending(
      identityFor(user, query.anonymousId),
      query.limit,
    );
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('similar/:productId')
  getSimilar(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('productId') productId: string,
    @Query() query: ListRecommendationsQueryDto,
  ) {
    return this.recommendations.getSimilar(
      identityFor(user, query.anonymousId),
      productId,
      query.limit,
    );
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('frequently-bought-with/:productId')
  getFrequentlyBoughtWith(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('productId') productId: string,
    @Query() query: ListRecommendationsQueryDto,
  ) {
    return this.recommendations.getFrequentlyBoughtWith(
      identityFor(user, query.anonymousId),
      productId,
      query.limit,
    );
  }

  // ---- Admin ------------------------------------------------------------------

  @Roles(...ADMIN_ROLES)
  @Post('admin/reindex-embeddings')
  reindexEmbeddings() {
    return this.embeddings.reindexAll();
  }

  @Roles(...ANALYTICS_ROLES)
  @Get('admin/evaluate')
  evaluate(@Query() query: EvaluateQueryDto) {
    return this.evaluation.evaluate(query.k);
  }
}

function identityFor(
  user: AuthenticatedUser | undefined,
  anonymousId?: string,
): Identity {
  return user ? { userId: user.id } : { anonymousId };
}

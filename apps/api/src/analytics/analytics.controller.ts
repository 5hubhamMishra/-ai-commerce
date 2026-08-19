import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { EvaluationService } from '../recommendations/evaluation.service';
import { SearchAnalyticsService } from '../search/search-analytics.service';
import { ShopAIAnalyticsService } from '../shopai/shopai-analytics.service';
import { BusinessInsightsService } from './business-insights.service';
import { DemandForecastQueryDto } from './dto/demand-forecast-query.dto';
import { InventoryRiskQueryDto } from './dto/inventory-risk-query.dto';
import { VariantForecastQueryDto } from './dto/variant-forecast-query.dto';
import { DemandForecastingService } from './demand-forecasting.service';
import { InventoryPredictionService } from './inventory-prediction.service';
import { SegmentationService } from './segmentation.service';

const ANALYTICS_ROLES = [Role.ANALYST, Role.ADMIN, Role.SUPER_ADMIN];
const INVENTORY_ROLES = [
  Role.ANALYST,
  Role.INVENTORY_MANAGER,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];

/** Entirely admin-facing, real-data reporting — no public routes, no writes,
 *  so no AuditService calls (same "GET-only report endpoint" precedent as
 *  SearchController's/RecommendationsController's own admin routes). */
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly segmentation: SegmentationService,
    private readonly demand: DemandForecastingService,
    private readonly inventory: InventoryPredictionService,
    private readonly insights: BusinessInsightsService,
    private readonly recommendationsEval: EvaluationService,
    private readonly searchAnalytics: SearchAnalyticsService,
    private readonly shopaiAnalytics: ShopAIAnalyticsService,
  ) {}

  @Roles(...ANALYTICS_ROLES)
  @Get('admin/segmentation')
  getSegmentation() {
    return this.segmentation.getReport();
  }

  @Roles(...ANALYTICS_ROLES)
  @Get('admin/demand-forecast')
  getDemandForecast(@Query() query: DemandForecastQueryDto) {
    return this.demand.forecastAll(query);
  }

  @Roles(...ANALYTICS_ROLES)
  @Get('admin/demand-forecast/:variantId')
  async getVariantDemandForecast(
    @Param('variantId') variantId: string,
    @Query() query: VariantForecastQueryDto,
  ) {
    const forecast = await this.demand.forecastVariant(
      variantId,
      query.lookbackDays,
    );
    if (!forecast) {
      throw new NotFoundException({
        code: 'PRODUCT_VARIANT_NOT_FOUND',
        message: 'Product variant not found.',
      });
    }
    return forecast;
  }

  @Roles(...INVENTORY_ROLES)
  @Get('admin/inventory-risk')
  getInventoryRisk(@Query() query: InventoryRiskQueryDto) {
    return this.inventory.getStockoutRisks(query);
  }

  @Roles(...ANALYTICS_ROLES)
  @Get('admin/insights')
  getInsights() {
    return this.insights.generate();
  }

  /** One combined payload for an admin analytics dashboard — reuses every
   *  report above plus the recommendation/search/ShopAI analytics already
   *  built in Phases 7-9, rather than re-implementing or re-routing them
   *  (their own dedicated admin endpoints — /recommendations/admin/evaluate,
   *  /search/admin/analytics, /shopai/admin/analytics — still exist
   *  unchanged for direct access). */
  @Roles(...ANALYTICS_ROLES)
  @Get('admin/dashboard')
  async getDashboard() {
    const [
      segmentation,
      stockoutRisks,
      recommendations,
      search,
      shopai,
      insights,
    ] = await Promise.all([
      this.segmentation.getReport(),
      this.inventory.getStockoutRisks({ limit: 10 }),
      this.recommendationsEval.evaluate(),
      this.searchAnalytics.getReport(),
      this.shopaiAnalytics.getReport(),
      this.insights.generate(),
    ]);

    return {
      segmentation,
      topStockoutRisks: stockoutRisks,
      recommendations,
      search,
      shopai,
      insights,
    };
  }
}

import { Module } from '@nestjs/common';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { SearchModule } from '../search/search.module';
import { ShopAIModule } from '../shopai/shopai.module';
import { AnalyticsController } from './analytics.controller';
import { BusinessInsightsService } from './business-insights.service';
import { DemandForecastingService } from './demand-forecasting.service';
import { InventoryPredictionService } from './inventory-prediction.service';
import { SegmentationService } from './segmentation.service';

@Module({
  // Reuses Phase 7/8/9's already-built EvaluationService/SearchAnalyticsService/
  // ShopAIAnalyticsService for "recommendation analytics"/"search analytics"/AI
  // business insights, rather than re-implementing them — see
  // BusinessInsightsService's doc comment.
  imports: [RecommendationsModule, SearchModule, ShopAIModule],
  controllers: [AnalyticsController],
  providers: [
    SegmentationService,
    DemandForecastingService,
    InventoryPredictionService,
    BusinessInsightsService,
  ],
})
export class AnalyticsModule {}

import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { QUERY_UNDERSTANDING_PROVIDER } from './query-understanding/query-understanding.interface';
import { RuleBasedQueryUnderstandingAdapter } from './query-understanding/rule-based-query-understanding.adapter';
import { SearchAnalyticsService } from './search-analytics.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [EmbeddingsModule],
  controllers: [SearchController],
  providers: [
    RuleBasedQueryUnderstandingAdapter,
    {
      provide: QUERY_UNDERSTANDING_PROVIDER,
      useExisting: RuleBasedQueryUnderstandingAdapter,
    },
    SearchAnalyticsService,
    SearchService,
  ],
  // SearchService is consumed directly by ShopAI's search_products tool
  // (Phase 9); SearchAnalyticsService by Phase 10's AnalyticsModule — same
  // "export what a later phase needs" precedent as ProductsModule (Phase 5)
  // and ComparisonModule (Phase 9).
  exports: [SearchService, SearchAnalyticsService],
})
export class SearchModule {}

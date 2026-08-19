import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CartModule } from '../cart/cart.module';
import { ComparisonModule } from '../comparison/comparison.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { SearchModule } from '../search/search.module';
import { AnthropicLLMAdapter } from './providers/anthropic-llm.adapter';
import { LLM_PROVIDER } from './providers/llm-provider.interface';
import { ShopAIAnalyticsService } from './shopai-analytics.service';
import { SHOPAI_CONFIG } from './shopai.config';
import { ShopAIController } from './shopai.controller';
import { ShopAIService } from './shopai.service';
import { AddToCartTool } from './tools/add-to-cart.tool';
import { CompareProductsTool } from './tools/compare-products.tool';
import { GetCartTool } from './tools/get-cart.tool';
import { GetDeliveryInfoTool } from './tools/get-delivery-info.tool';
import { GetOrderInfoTool } from './tools/get-order-info.tool';
import { GetProductDetailsTool } from './tools/get-product-details.tool';
import { GetRecommendationsTool } from './tools/get-recommendations.tool';
import { GetReturnPolicyTool } from './tools/get-return-policy.tool';
import { SearchProductsTool } from './tools/search-products.tool';
import { SHOPAI_TOOLS } from './tools/shopai-tools.token';

const TOOL_PROVIDERS = [
  SearchProductsTool,
  GetProductDetailsTool,
  CompareProductsTool,
  GetRecommendationsTool,
  GetCartTool,
  AddToCartTool,
  GetOrderInfoTool,
  GetDeliveryInfoTool,
  GetReturnPolicyTool,
];

@Module({
  imports: [
    SearchModule,
    ProductsModule,
    ComparisonModule,
    RecommendationsModule,
    CartModule,
    OrdersModule,
  ],
  controllers: [ShopAIController],
  providers: [
    {
      provide: SHOPAI_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        anthropicApiKey: config.getOrThrow<string>('shopai.anthropicApiKey'),
        model: config.getOrThrow<string>('shopai.model'),
        maxToolIterations: config.getOrThrow<number>(
          'shopai.maxToolIterations',
        ),
      }),
    },
    AnthropicLLMAdapter,
    { provide: LLM_PROVIDER, useExisting: AnthropicLLMAdapter },
    ...TOOL_PROVIDERS,
    {
      provide: SHOPAI_TOOLS,
      // The allowed-tool registry — only these instances are ever callable.
      inject: TOOL_PROVIDERS,
      useFactory: (...tools: unknown[]) => tools,
    },
    ShopAIAnalyticsService,
    ShopAIService,
  ],
  // ShopAIAnalyticsService is consumed directly by Phase 10's AnalyticsModule
  // (AI business insights) — same "export what a later phase needs"
  // precedent as SearchModule/RecommendationsModule.
  exports: [ShopAIAnalyticsService],
})
export class ShopAIModule {}

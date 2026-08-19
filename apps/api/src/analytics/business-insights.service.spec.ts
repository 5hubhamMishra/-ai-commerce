import { Test } from '@nestjs/testing';
import { EvaluationService } from '../recommendations/evaluation.service';
import { SearchAnalyticsService } from '../search/search-analytics.service';
import { ShopAIAnalyticsService } from '../shopai/shopai-analytics.service';
import { BusinessInsightsService } from './business-insights.service';
import { DemandForecastingService } from './demand-forecasting.service';
import { InventoryPredictionService } from './inventory-prediction.service';
import { SegmentationService } from './segmentation.service';

const EMPTY_SEGMENTATION = {
  totalProfiles: 0,
  bySegment: [],
  byLifecycleStage: [],
};
const NO_DATA_EVAL = {
  catalog: { purchasableProducts: 0 },
  coverage: { productCoverage: 0, categoryCoverage: 0, totalImpressions: 0 },
  engagement: {
    clickThroughRate: null,
    conversionRate: null,
    distinctImpressionPairs: 0,
  },
  offlineBacktest: { k: 10, eligibleUsers: 0, hitRateAtK: null },
};
const NO_DATA_SEARCH = {
  windowDays: 30,
  totalSearches: 0,
  zeroResultSearches: 0,
  zeroResultRate: 0,
  semanticUsageRate: 0,
  topQueries: [],
  topZeroResultQueries: [],
};
const NO_DATA_SHOPAI = {
  windowDays: 30,
  totalInteractions: 0,
  refusalRate: 0,
  avgToolCallsPerInteraction: 0,
  avgLatencyMs: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  topTools: [],
};

async function buildService(overrides: {
  segmentation?: unknown;
  forecasts?: unknown[];
  risks?: unknown[];
  recEval?: unknown;
  search?: unknown;
  shopai?: unknown;
}) {
  const segmentation = {
    getReport: jest
      .fn()
      .mockResolvedValue(overrides.segmentation ?? EMPTY_SEGMENTATION),
  };
  const demand = {
    forecastAll: jest.fn().mockResolvedValue(overrides.forecasts ?? []),
  };
  const inventory = {
    getStockoutRisks: jest.fn().mockResolvedValue(overrides.risks ?? []),
  };
  const recommendationsEval = {
    evaluate: jest.fn().mockResolvedValue(overrides.recEval ?? NO_DATA_EVAL),
  };
  const searchAnalytics = {
    getReport: jest.fn().mockResolvedValue(overrides.search ?? NO_DATA_SEARCH),
  };
  const shopaiAnalytics = {
    getReport: jest.fn().mockResolvedValue(overrides.shopai ?? NO_DATA_SHOPAI),
  };

  const module = await Test.createTestingModule({
    providers: [
      BusinessInsightsService,
      { provide: SegmentationService, useValue: segmentation },
      { provide: DemandForecastingService, useValue: demand },
      { provide: InventoryPredictionService, useValue: inventory },
      { provide: EvaluationService, useValue: recommendationsEval },
      { provide: SearchAnalyticsService, useValue: searchAnalytics },
      { provide: ShopAIAnalyticsService, useValue: shopaiAnalytics },
    ],
  }).compile();

  return module.get(BusinessInsightsService);
}

describe('BusinessInsightsService.generate', () => {
  it('reports every category as honestly having no data when nothing has happened yet', async () => {
    const service = await buildService({});
    const insights = await service.generate();
    const ids = insights.map((i) => i.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'customers.no_data',
        'demand.no_products',
        'inventory.no_risk',
        'recommendations.no_data',
        'search.no_data',
        'shopai.no_data',
      ]),
    );
    expect(insights.every((i) => i.severity === 'info')).toBe(true);
  });

  it('flags a low repeat-buyer share as a warning, backed by the real counts', async () => {
    const service = await buildService({
      segmentation: {
        totalProfiles: 10,
        bySegment: [{ segment: 'repeat_buyer', count: 0, share: 0 }],
        byLifecycleStage: [{ stage: 'prospect', count: 8, share: 0.8 }],
      },
    });
    const insights = await service.generate();
    const repeatBuyerInsight = insights.find(
      (i) => i.id === 'customers.repeat_buyer_share',
    );
    expect(repeatBuyerInsight?.severity).toBe('warning');
    expect(repeatBuyerInsight?.metrics).toMatchObject({
      repeatBuyerCount: 0,
      totalProfiles: 10,
    });
  });

  it('raises a critical insight when any product is at critical stockout risk', async () => {
    const service = await buildService({
      risks: [
        {
          variantId: 'v1',
          productId: 'p1',
          productName: 'Wireless Mouse',
          sku: 'SKU-1',
          availableUnits: 3,
          reorderPoint: 5,
          belowReorderPoint: true,
          dailyRate: 1,
          dataSufficient: true,
          daysUntilStockout: 3,
          riskLevel: 'critical',
        },
      ],
    });
    const insights = await service.generate();
    const critical = insights.find(
      (i) => i.id === 'inventory.critical_stockout',
    );
    expect(critical?.severity).toBe('critical');
    expect(critical?.message).toContain('Wireless Mouse');
  });

  it('flags a high search zero-result rate as a warning', async () => {
    const service = await buildService({
      search: {
        ...NO_DATA_SEARCH,
        totalSearches: 100,
        zeroResultSearches: 40,
        zeroResultRate: 0.4,
      },
    });
    const insights = await service.generate();
    const insight = insights.find((i) => i.id === 'search.zero_result_rate');
    expect(insight?.severity).toBe('warning');
  });

  it('flags a high ShopAI refusal rate as a warning', async () => {
    const service = await buildService({
      shopai: { ...NO_DATA_SHOPAI, totalInteractions: 50, refusalRate: 0.2 },
    });
    const insights = await service.generate();
    const insight = insights.find((i) => i.id === 'shopai.usage');
    expect(insight?.severity).toBe('warning');
  });

  it('reports a real, non-null recommendation click-through rate when impression data exists', async () => {
    const service = await buildService({
      recEval: {
        ...NO_DATA_EVAL,
        engagement: {
          clickThroughRate: 0.25,
          conversionRate: 0.1,
          distinctImpressionPairs: 40,
        },
      },
    });
    const insights = await service.generate();
    const insight = insights.find((i) => i.id === 'recommendations.engagement');
    expect(insight?.severity).toBe('info');
    expect(insight?.metrics.clickThroughRate).toBe(0.25);
  });
});

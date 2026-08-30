import { Injectable } from '@nestjs/common';
import { EvaluationService } from '../recommendations/evaluation.service';
import { SearchAnalyticsService } from '../search/search-analytics.service';
import { ShopAIAnalyticsService } from '../shopai/shopai-analytics.service';
import {
  INSIGHT_HIGH_SHOPAI_REFUSAL_RATE,
  INSIGHT_HIGH_ZERO_RESULT_RATE,
  INSIGHT_LOW_REPEAT_BUYER_SHARE,
  INSIGHT_MIN_PROFILES_FOR_SEGMENT_INSIGHT,
  STOCKOUT_CRITICAL_DAYS,
} from './analytics-config';
import { DemandForecastingService } from './demand-forecasting.service';
import { InventoryPredictionService } from './inventory-prediction.service';
import { SegmentationService } from './segmentation.service';

export type InsightSeverity = 'info' | 'warning' | 'critical';
export type InsightCategory =
  'customers' | 'inventory' | 'recommendations' | 'search' | 'shopai';

export type BusinessInsight = {
  id: string;
  category: InsightCategory;
  severity: InsightSeverity;
  message: string;
  /** The exact real numbers the message is templated around — every
   *  insight must be traceable back to a computed metric, never freeform
   *  text (PROMPT 11: "Never fabricate business insights"). */
  metrics: Record<string, number | null>;
};

export const INSIGHTS_LOOKUP_LIMIT = 1000; // generous at this catalog's real scale — see analytics-config.ts precedent

type InsightInputs = {
  segmentationReport: SegmentationReport;
  forecasts: Awaited<ReturnType<DemandForecastingService['forecastAll']>>;
  stockoutRisks: StockoutRiskList;
  recEval: Awaited<ReturnType<EvaluationService['evaluate']>>;
  searchReport: Awaited<ReturnType<SearchAnalyticsService['getReport']>>;
  shopaiReport: Awaited<ReturnType<ShopAIAnalyticsService['getReport']>>;
};

/**
 * "AI business insights" — PROMPT 11's own bullet. Deliberately not an LLM
 * call: every insight here is a deterministic rule evaluated against real,
 * already-computed metrics from this phase's own services plus Phases 7-9's
 * (recommendations/search/ShopAI analytics), so "never fabricate business
 * insights" holds by construction rather than by hoping a model stays
 * grounded. Each `BusinessInsight` carries the exact metric values its
 * message is templated around — nothing here is freeform generated text.
 * (An LLM-authored narrative layer on top of these real numbers is a
 * reasonable future upgrade, not required by PROMPT 11, and would need the
 * same real-Anthropic-billing dependency Phase 9's ShopAI is still waiting
 * on — see docs/DECISIONS.md ADR-025.)
 */
@Injectable()
export class BusinessInsightsService {
  constructor(
    private readonly segmentation: SegmentationService,
    private readonly demand: DemandForecastingService,
    private readonly inventory: InventoryPredictionService,
    private readonly recommendationsEval: EvaluationService,
    private readonly searchAnalytics: SearchAnalyticsService,
    private readonly shopaiAnalytics: ShopAIAnalyticsService,
  ) {}

  async generate(inputs?: InsightInputs): Promise<BusinessInsight[]> {
    const reports: InsightInputs =
      inputs ??
      (await Promise.all([
        this.segmentation.getReport(),
        this.demand.forecastAll({ limit: INSIGHTS_LOOKUP_LIMIT }),
        this.inventory.getStockoutRisks({ limit: INSIGHTS_LOOKUP_LIMIT }),
        this.recommendationsEval.evaluate(),
        this.searchAnalytics.getReport(),
        this.shopaiAnalytics.getReport(),
      ]).then(
        ([
          segmentationReport,
          forecasts,
          stockoutRisks,
          recEval,
          searchReport,
          shopaiReport,
        ]) => ({
          segmentationReport,
          forecasts,
          stockoutRisks,
          recEval,
          searchReport,
          shopaiReport,
        }),
      ));

    return [
      ...this.customerInsights(reports.segmentationReport),
      ...this.demandInsights(reports.forecasts),
      ...this.inventoryInsights(reports.stockoutRisks),
      ...this.recommendationInsights(reports.recEval),
      ...this.searchInsights(reports.searchReport),
      ...this.shopaiInsights(reports.shopaiReport),
    ];
  }

  private customerInsights(
    report: Awaited<ReturnType<SegmentationService['getReport']>>,
  ): BusinessInsight[] {
    if (report.totalProfiles === 0) {
      return [
        {
          id: 'customers.no_data',
          category: 'customers',
          severity: 'info',
          message:
            'No customer behavioral profiles exist yet — segmentation has no data to report.',
          metrics: { totalProfiles: 0 },
        },
      ];
    }

    const insights: BusinessInsight[] = [];
    const repeatBuyer = report.bySegment.find(
      (s) => s.segment === 'repeat_buyer',
    );
    const repeatBuyerShare = repeatBuyer?.share ?? 0;
    if (report.totalProfiles >= INSIGHT_MIN_PROFILES_FOR_SEGMENT_INSIGHT) {
      insights.push({
        id: 'customers.repeat_buyer_share',
        category: 'customers',
        severity:
          repeatBuyerShare < INSIGHT_LOW_REPEAT_BUYER_SHARE
            ? 'warning'
            : 'info',
        message:
          repeatBuyerShare < INSIGHT_LOW_REPEAT_BUYER_SHARE
            ? `Only ${(repeatBuyerShare * 100).toFixed(1)}% of tracked customers (${repeatBuyer?.count ?? 0} of ${report.totalProfiles}) are repeat buyers.`
            : `${(repeatBuyerShare * 100).toFixed(1)}% of tracked customers (${repeatBuyer?.count ?? 0} of ${report.totalProfiles}) are repeat buyers.`,
        metrics: {
          repeatBuyerCount: repeatBuyer?.count ?? 0,
          totalProfiles: report.totalProfiles,
          repeatBuyerShare,
        },
      });
    }

    const prospects = report.byLifecycleStage.find(
      (s) => s.stage === 'prospect',
    );
    if (prospects) {
      insights.push({
        id: 'customers.lifecycle_prospects',
        category: 'customers',
        severity: 'info',
        message: `${(prospects.share * 100).toFixed(1)}% of tracked customers (${prospects.count} of ${report.totalProfiles}) are still prospects — tracked but have never completed an order.`,
        metrics: {
          prospectCount: prospects.count,
          totalProfiles: report.totalProfiles,
          prospectShare: prospects.share,
        },
      });
    }

    return insights;
  }

  private demandInsights(
    forecasts: Awaited<ReturnType<DemandForecastingService['forecastAll']>>,
  ): BusinessInsight[] {
    if (forecasts.length === 0) {
      return [
        {
          id: 'demand.no_products',
          category: 'inventory',
          severity: 'info',
          message: 'No purchasable products exist yet to forecast demand for.',
          metrics: { purchasableProducts: 0 },
        },
      ];
    }

    const increasing = forecasts.filter((f) => f.trend === 'increasing').length;
    const decreasing = forecasts.filter((f) => f.trend === 'decreasing').length;
    const noData = forecasts.filter((f) => f.trend === 'no_data').length;

    if (noData === forecasts.length) {
      return [
        {
          id: 'demand.no_sales_history',
          category: 'inventory',
          severity: 'info',
          message: `None of the ${forecasts.length} purchasable products have real paid-order history yet — demand forecasting has no data to report.`,
          metrics: {
            purchasableProducts: forecasts.length,
            noDataCount: noData,
          },
        },
      ];
    }

    return [
      {
        id: 'demand.trend_summary',
        category: 'inventory',
        severity: 'info',
        message: `Of ${forecasts.length} purchasable products, ${increasing} show increasing recent demand and ${decreasing} show decreasing recent demand (${noData} have no sales history in the forecast window).`,
        metrics: {
          purchasableProducts: forecasts.length,
          increasingCount: increasing,
          decreasingCount: decreasing,
          noDataCount: noData,
        },
      },
    ];
  }

  private inventoryInsights(risks: StockoutRiskList): BusinessInsight[] {
    const critical = risks.filter((r) => r.riskLevel === 'critical');
    const warning = risks.filter((r) => r.riskLevel === 'warning');

    if (critical.length === 0 && warning.length === 0) {
      return [
        {
          id: 'inventory.no_risk',
          category: 'inventory',
          severity: 'info',
          message: 'No products are currently at elevated stockout risk.',
          metrics: { criticalCount: 0, warningCount: 0 },
        },
      ];
    }

    const insights: BusinessInsight[] = [];
    if (critical.length > 0) {
      insights.push({
        id: 'inventory.critical_stockout',
        category: 'inventory',
        severity: 'critical',
        message: `${critical.length} product${critical.length === 1 ? '' : 's'} at critical stockout risk — projected to run out within ${STOCKOUT_CRITICAL_DAYS} days (e.g. ${critical[0].productName}, ${critical[0].availableUnits} units left).`,
        metrics: { criticalCount: critical.length },
      });
    }
    if (warning.length > 0) {
      insights.push({
        id: 'inventory.warning_stockout',
        category: 'inventory',
        severity: 'warning',
        message: `${warning.length} product${warning.length === 1 ? '' : 's'} at elevated stockout risk or below their configured reorder point.`,
        metrics: { warningCount: warning.length },
      });
    }
    return insights;
  }

  private recommendationInsights(
    evalReport: Awaited<ReturnType<EvaluationService['evaluate']>>,
  ): BusinessInsight[] {
    if (evalReport.engagement.clickThroughRate === null) {
      return [
        {
          id: 'recommendations.no_data',
          category: 'recommendations',
          severity: 'info',
          message:
            'Not enough recommendation impression data yet to measure click-through rate.',
          metrics: {
            distinctImpressionPairs:
              evalReport.engagement.distinctImpressionPairs,
          },
        },
      ];
    }

    return [
      {
        id: 'recommendations.engagement',
        category: 'recommendations',
        severity: 'info',
        message: `Recommendation click-through rate is ${(evalReport.engagement.clickThroughRate * 100).toFixed(1)}% across ${evalReport.engagement.distinctImpressionPairs} tracked impressions (product coverage: ${(evalReport.coverage.productCoverage * 100).toFixed(1)}%).`,
        metrics: {
          clickThroughRate: evalReport.engagement.clickThroughRate,
          conversionRate: evalReport.engagement.conversionRate,
          distinctImpressionPairs:
            evalReport.engagement.distinctImpressionPairs,
          productCoverage: evalReport.coverage.productCoverage,
        },
      },
    ];
  }

  private searchInsights(
    searchReport: Awaited<ReturnType<SearchAnalyticsService['getReport']>>,
  ): BusinessInsight[] {
    if (searchReport.totalSearches === 0) {
      return [
        {
          id: 'search.no_data',
          category: 'search',
          severity: 'info',
          message: `No search traffic recorded in the last ${searchReport.windowDays} days.`,
          metrics: { totalSearches: 0 },
        },
      ];
    }

    const highZeroResult =
      searchReport.zeroResultRate >= INSIGHT_HIGH_ZERO_RESULT_RATE;
    return [
      {
        id: 'search.zero_result_rate',
        category: 'search',
        severity: highZeroResult ? 'warning' : 'info',
        message: `Zero-result search rate is ${(searchReport.zeroResultRate * 100).toFixed(1)}% over the last ${searchReport.windowDays} days (${searchReport.zeroResultSearches} of ${searchReport.totalSearches} searches).`,
        metrics: {
          zeroResultRate: searchReport.zeroResultRate,
          zeroResultSearches: searchReport.zeroResultSearches,
          totalSearches: searchReport.totalSearches,
        },
      },
    ];
  }

  private shopaiInsights(
    shopaiReport: Awaited<ReturnType<ShopAIAnalyticsService['getReport']>>,
  ): BusinessInsight[] {
    if (shopaiReport.totalInteractions === 0) {
      return [
        {
          id: 'shopai.no_data',
          category: 'shopai',
          severity: 'info',
          message: `ShopAI has completed no interactions in the last ${shopaiReport.windowDays} days.`,
          metrics: { totalInteractions: 0 },
        },
      ];
    }

    const highRefusal =
      shopaiReport.refusalRate >= INSIGHT_HIGH_SHOPAI_REFUSAL_RATE;
    return [
      {
        id: 'shopai.usage',
        category: 'shopai',
        severity: highRefusal ? 'warning' : 'info',
        message: `ShopAI completed ${shopaiReport.totalInteractions} interactions over the last ${shopaiReport.windowDays} days, refusing ${(shopaiReport.refusalRate * 100).toFixed(1)}% (avg ${shopaiReport.avgToolCallsPerInteraction.toFixed(1)} tool calls, ${Math.round(shopaiReport.avgLatencyMs)}ms avg latency).`,
        metrics: {
          totalInteractions: shopaiReport.totalInteractions,
          refusalRate: shopaiReport.refusalRate,
          avgToolCallsPerInteraction: shopaiReport.avgToolCallsPerInteraction,
          avgLatencyMs: shopaiReport.avgLatencyMs,
        },
      },
    ];
  }
}

type StockoutRiskList = Awaited<
  ReturnType<InventoryPredictionService['getStockoutRisks']>
>;

type SegmentationReport = Awaited<ReturnType<SegmentationService['getReport']>>;

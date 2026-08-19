import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEMAND_FORECAST_LOOKBACK_DAYS,
  INVENTORY_RISK_DEFAULT_LIMIT,
  STOCKOUT_CRITICAL_DAYS,
  STOCKOUT_WARNING_DAYS,
} from './analytics-config';
import { DemandForecastingService } from './demand-forecasting.service';

export type RiskLevel = 'critical' | 'warning' | 'ok';

export type StockoutRisk = {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  availableUnits: number;
  reorderPoint: number;
  belowReorderPoint: boolean;
  dailyRate: number;
  dataSufficient: boolean;
  daysUntilStockout: number | null;
  riskLevel: RiskLevel;
};

const RISK_ORDER: Record<RiskLevel, number> = {
  critical: 0,
  warning: 1,
  ok: 2,
};

/**
 * Inventory prediction and stockout prediction — PROMPT 11's own bullets.
 * Combines DemandForecastingService's real recent-half daily sales rate with
 * real current inventory (`available` = onHand - reserved - committed,
 * summed across warehouses — the same derivation InventoryService/
 * ProductsService already use, clipped at 0) and the admin-set
 * `reorderPoint` (a Phase 2 field that had no reader until now) into two
 * independent, both-real risk triggers:
 *
 *   1. Velocity-based: daysUntilStockout = availableUnits / dailyRate,
 *      computed only when there's real recent sales velocity to divide by.
 *      'critical' at <= STOCKOUT_CRITICAL_DAYS, 'warning' at
 *      <= STOCKOUT_WARNING_DAYS.
 *   2. Reorder-point breach: availableUnits <= reorderPoint is itself a
 *      real, admin-configured signal — surfaced as 'warning' even with no
 *      sales velocity to project a date from (e.g. a new product with a low
 *      starting stock). `daysUntilStockout` stays `null` in that case —
 *      reported honestly as "unknown", never guessed.
 *
 * reorderPoint is summed across a variant's warehouses the same way
 * `available` is — an aggregate "total reorder threshold across all
 * locations combined," a documented simplification consistent with how the
 * whole codebase already treats `available` as a cross-warehouse aggregate
 * (no per-warehouse split shipment support — see DECISIONS.md ADR-014).
 */
@Injectable()
export class InventoryPredictionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demand: DemandForecastingService,
  ) {}

  async getStockoutRisks(
    params: { lookbackDays?: number; limit?: number } = {},
  ): Promise<StockoutRisk[]> {
    const lookbackDays = params.lookbackDays ?? DEMAND_FORECAST_LOOKBACK_DAYS;
    const limit = params.limit ?? INVENTORY_RISK_DEFAULT_LIMIT;

    const variants = await this.demand.purchasableVariants();
    if (variants.length === 0) return [];

    const variantIds = variants.map((v) => v.id);
    const [rates, inventorySums] = await Promise.all([
      this.demand.getRates(variantIds, lookbackDays),
      this.getAvailableAndReorder(variantIds),
    ]);

    const risks: StockoutRisk[] = variants.map((v) => {
      const rate = rates.get(v.id);
      const halfWindowDays = rate?.halfWindowDays ?? lookbackDays / 2;
      const dailyRate =
        rate && rate.unitsRecentHalf > 0
          ? rate.unitsRecentHalf / halfWindowDays
          : rate && rate.unitsEarlierHalf > 0
            ? rate.unitsEarlierHalf / halfWindowDays
            : 0;
      const inv = inventorySums.get(v.id) ?? { available: 0, reorderPoint: 0 };
      const dataSufficient = dailyRate > 0;
      const daysUntilStockout = dataSufficient
        ? inv.available / dailyRate
        : null;
      const belowReorderPoint = inv.available <= inv.reorderPoint;

      let riskLevel: RiskLevel = 'ok';
      if (dataSufficient && daysUntilStockout !== null) {
        if (daysUntilStockout <= STOCKOUT_CRITICAL_DAYS) riskLevel = 'critical';
        else if (daysUntilStockout <= STOCKOUT_WARNING_DAYS)
          riskLevel = 'warning';
      } else if (belowReorderPoint) {
        riskLevel = 'warning';
      }

      return {
        variantId: v.id,
        productId: v.productId,
        productName: v.product.name,
        sku: v.sku,
        availableUnits: inv.available,
        reorderPoint: inv.reorderPoint,
        belowReorderPoint,
        dailyRate,
        dataSufficient,
        daysUntilStockout,
        riskLevel,
      };
    });

    return risks
      .filter((r) => r.riskLevel !== 'ok')
      .sort((a, b) => {
        if (RISK_ORDER[a.riskLevel] !== RISK_ORDER[b.riskLevel]) {
          return RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel];
        }
        return (
          (a.daysUntilStockout ?? Infinity) - (b.daysUntilStockout ?? Infinity)
        );
      })
      .slice(0, limit);
  }

  private async getAvailableAndReorder(
    variantIds: string[],
  ): Promise<Map<string, { available: number; reorderPoint: number }>> {
    const rows = await this.prisma.inventory.groupBy({
      by: ['variantId'],
      where: { variantId: { in: variantIds } },
      _sum: {
        quantityOnHand: true,
        quantityReserved: true,
        quantityCommitted: true,
        reorderPoint: true,
      },
    });

    const map = new Map<string, { available: number; reorderPoint: number }>();
    for (const row of rows) {
      const onHand = row._sum.quantityOnHand ?? 0;
      const reserved = row._sum.quantityReserved ?? 0;
      const committed = row._sum.quantityCommitted ?? 0;
      map.set(row.variantId, {
        available: Math.max(0, onHand - reserved - committed),
        reorderPoint: row._sum.reorderPoint ?? 0,
      });
    }
    return map;
  }
}

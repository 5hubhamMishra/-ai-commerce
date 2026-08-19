import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DemandForecastingService } from './demand-forecasting.service';
import { InventoryPredictionService } from './inventory-prediction.service';

function variant(id: string, name = 'Widget') {
  return {
    id,
    sku: `SKU-${id}`,
    productId: `product-${id}`,
    product: { name },
  };
}

function inventoryRow(
  variantId: string,
  { onHand = 0, reserved = 0, committed = 0, reorderPoint = 0 } = {},
) {
  return {
    variantId,
    _sum: {
      quantityOnHand: onHand,
      quantityReserved: reserved,
      quantityCommitted: committed,
      reorderPoint,
    },
  };
}

async function buildService(overrides: {
  variants?: unknown[];
  inventoryRows?: unknown[];
  rates?: Map<
    string,
    {
      unitsEarlierHalf: number;
      unitsRecentHalf: number;
      halfWindowDays: number;
    }
  >;
}) {
  const prisma = {
    inventory: {
      groupBy: jest.fn().mockResolvedValue(overrides.inventoryRows ?? []),
    },
  };
  const demand = {
    purchasableVariants: jest.fn().mockResolvedValue(overrides.variants ?? []),
    getRates: jest.fn().mockResolvedValue(overrides.rates ?? new Map()),
  };

  const module = await Test.createTestingModule({
    providers: [
      InventoryPredictionService,
      { provide: PrismaService, useValue: prisma },
      { provide: DemandForecastingService, useValue: demand },
    ],
  }).compile();

  return { service: module.get(InventoryPredictionService) };
}

describe('InventoryPredictionService.getStockoutRisks', () => {
  it('returns an empty array when there are no purchasable variants', async () => {
    const { service } = await buildService({ variants: [] });
    expect(await service.getStockoutRisks()).toEqual([]);
  });

  it('flags a variant as critical when velocity projects a stockout within the critical window', async () => {
    const { service } = await buildService({
      variants: [variant('a')],
      inventoryRows: [inventoryRow('a', { onHand: 10 })],
      rates: new Map([
        ['a', { unitsEarlierHalf: 0, unitsRecentHalf: 90, halfWindowDays: 45 }],
      ]),
    });
    // dailyRate = 90/45 = 2/day, available = 10 -> 5 days until stockout (<= 7 -> critical)
    const risks = await service.getStockoutRisks();
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({
      variantId: 'a',
      riskLevel: 'critical',
      dataSufficient: true,
    });
    expect(risks[0].daysUntilStockout).toBeCloseTo(5, 5);
  });

  it('flags a variant as warning when projected stockout falls in the warning window', async () => {
    // dailyRate = 45/45 = 1/day, available = 15 -> 15 days (> 7 critical cutoff, <= 21 warning cutoff).
    const { service } = await buildService({
      variants: [variant('a')],
      inventoryRows: [inventoryRow('a', { onHand: 15 })],
      rates: new Map([
        ['a', { unitsEarlierHalf: 0, unitsRecentHalf: 45, halfWindowDays: 45 }],
      ]),
    });
    const risks = await service.getStockoutRisks();
    expect(risks[0]).toMatchObject({ riskLevel: 'warning' });
  });

  it('excludes a variant with healthy runway from the results', async () => {
    const { service } = await buildService({
      variants: [variant('a')],
      inventoryRows: [inventoryRow('a', { onHand: 1000 })],
      rates: new Map([
        ['a', { unitsEarlierHalf: 0, unitsRecentHalf: 45, halfWindowDays: 45 }],
      ]),
    });
    expect(await service.getStockoutRisks()).toEqual([]);
  });

  it('flags a reorder-point breach as warning even with no sales velocity, and reports days-until-stockout as null rather than guessing', async () => {
    const { service } = await buildService({
      variants: [variant('a')],
      inventoryRows: [inventoryRow('a', { onHand: 2, reorderPoint: 5 })],
      rates: new Map([
        ['a', { unitsEarlierHalf: 0, unitsRecentHalf: 0, halfWindowDays: 45 }],
      ]),
    });
    const risks = await service.getStockoutRisks();
    expect(risks[0]).toMatchObject({
      riskLevel: 'warning',
      dataSufficient: false,
      daysUntilStockout: null,
      belowReorderPoint: true,
    });
  });

  it('excludes a variant with no velocity but stock above its reorder point', async () => {
    const { service } = await buildService({
      variants: [variant('a')],
      inventoryRows: [inventoryRow('a', { onHand: 50, reorderPoint: 5 })],
      rates: new Map([
        ['a', { unitsEarlierHalf: 0, unitsRecentHalf: 0, halfWindowDays: 45 }],
      ]),
    });
    expect(await service.getStockoutRisks()).toEqual([]);
  });

  it('sorts critical risks before warning risks, and by soonest stockout within a level', async () => {
    const { service } = await buildService({
      variants: [
        variant('slow-critical'),
        variant('warning'),
        variant('fast-critical'),
      ],
      inventoryRows: [
        inventoryRow('slow-critical', { onHand: 12 }), // rate 2/day -> 6 days (critical)
        inventoryRow('warning', { onHand: 15 }), // rate 1/day -> 15 days (warning)
        inventoryRow('fast-critical', { onHand: 4 }), // rate 2/day -> 2 days (critical)
      ],
      rates: new Map([
        [
          'slow-critical',
          { unitsEarlierHalf: 0, unitsRecentHalf: 90, halfWindowDays: 45 },
        ],
        [
          'warning',
          { unitsEarlierHalf: 0, unitsRecentHalf: 45, halfWindowDays: 45 },
        ],
        [
          'fast-critical',
          { unitsEarlierHalf: 0, unitsRecentHalf: 90, halfWindowDays: 45 },
        ],
      ]),
    });

    const risks = await service.getStockoutRisks();
    expect(risks.map((r) => r.variantId)).toEqual([
      'fast-critical',
      'slow-critical',
      'warning',
    ]);
  });
});

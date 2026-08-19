import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DemandForecastingService } from './demand-forecasting.service';

const LOOKBACK_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();

function daysAgo(days: number): Date {
  return new Date(NOW - days * DAY_MS);
}

function orderItem(quantity: number, daysAgoOfOrder: number) {
  return {
    variantId: 'variant-1',
    quantity,
    order: { createdAt: daysAgo(daysAgoOfOrder) },
  };
}

async function buildService(prismaOverrides: {
  findUniqueVariant?: unknown;
  findManyVariants?: unknown[];
  orderItems?: unknown[];
}) {
  const prisma = {
    productVariant: {
      findUnique: jest
        .fn()
        .mockResolvedValue(prismaOverrides.findUniqueVariant ?? null),
      findMany: jest
        .fn()
        .mockResolvedValue(prismaOverrides.findManyVariants ?? []),
    },
    orderItem: {
      findMany: jest.fn().mockResolvedValue(prismaOverrides.orderItems ?? []),
    },
  };

  const module = await Test.createTestingModule({
    providers: [
      DemandForecastingService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();

  return { service: module.get(DemandForecastingService), prisma };
}

const VARIANT = {
  id: 'variant-1',
  sku: 'SKU-1',
  productId: 'product-1',
  deletedAt: null,
  product: { name: 'Wireless Mouse' },
};

describe('DemandForecastingService.forecastVariant', () => {
  it('returns null when the variant does not exist', async () => {
    const { service } = await buildService({ findUniqueVariant: null });
    expect(await service.forecastVariant('missing')).toBeNull();
  });

  it('returns null when the variant is soft-deleted', async () => {
    const { service } = await buildService({
      findUniqueVariant: { ...VARIANT, deletedAt: new Date() },
    });
    expect(await service.forecastVariant('variant-1')).toBeNull();
  });

  it('reports no_data and a zero projected rate when there is no sales history at all', async () => {
    const { service } = await buildService({
      findUniqueVariant: VARIANT,
      orderItems: [],
    });
    const forecast = await service.forecastVariant('variant-1', LOOKBACK_DAYS);
    expect(forecast).toMatchObject({
      trend: 'no_data',
      dataSufficient: false,
      projectedDailyRate: 0,
    });
  });

  it('classifies a real acceleration in recent sales as increasing', async () => {
    const { service } = await buildService({
      findUniqueVariant: VARIANT,
      orderItems: [orderItem(2, 80), orderItem(20, 5)],
    });
    const forecast = await service.forecastVariant('variant-1', LOOKBACK_DAYS);
    expect(forecast?.trend).toBe('increasing');
    expect(forecast?.unitsSoldEarlierHalf).toBe(2);
    expect(forecast?.unitsSoldRecentHalf).toBe(20);
    // Recent-half rate is the projection basis when recent sales exist.
    expect(forecast?.projectedDailyRate).toBeCloseTo(20 / 45, 5);
  });

  it('classifies a real slowdown in recent sales as decreasing', async () => {
    const { service } = await buildService({
      findUniqueVariant: VARIANT,
      orderItems: [orderItem(20, 80), orderItem(2, 5)],
    });
    const forecast = await service.forecastVariant('variant-1', LOOKBACK_DAYS);
    expect(forecast?.trend).toBe('decreasing');
  });

  it('classifies roughly even sales across both halves as stable', async () => {
    const { service } = await buildService({
      findUniqueVariant: VARIANT,
      orderItems: [orderItem(10, 80), orderItem(10, 5)],
    });
    const forecast = await service.forecastVariant('variant-1', LOOKBACK_DAYS);
    expect(forecast?.trend).toBe('stable');
  });

  it('falls back to the earlier half rate for the projection when only earlier sales exist', async () => {
    const { service } = await buildService({
      findUniqueVariant: VARIANT,
      orderItems: [orderItem(9, 80)],
    });
    const forecast = await service.forecastVariant('variant-1', LOOKBACK_DAYS);
    expect(forecast?.trend).toBe('decreasing');
    expect(forecast?.dataSufficient).toBe(true);
    expect(forecast?.projectedDailyRate).toBeCloseTo(9 / 45, 5);
  });
});

describe('DemandForecastingService.forecastAll', () => {
  it('sorts by projected daily rate descending and honors the limit', async () => {
    const variantA = { ...VARIANT, id: 'variant-a', sku: 'SKU-A' };
    const variantB = { ...VARIANT, id: 'variant-b', sku: 'SKU-B' };
    const { service } = await buildService({
      findManyVariants: [variantA, variantB],
      orderItems: [
        {
          variantId: 'variant-a',
          quantity: 5,
          order: { createdAt: daysAgo(5) },
        },
        {
          variantId: 'variant-b',
          quantity: 50,
          order: { createdAt: daysAgo(5) },
        },
      ],
    });

    const forecasts = await service.forecastAll({
      lookbackDays: LOOKBACK_DAYS,
      limit: 1,
    });
    expect(forecasts).toHaveLength(1);
    expect(forecasts[0].variantId).toBe('variant-b');
  });

  it('returns an empty array, not an error, when there are no purchasable variants', async () => {
    const { service } = await buildService({ findManyVariants: [] });
    expect(await service.forecastAll()).toEqual([]);
  });
});

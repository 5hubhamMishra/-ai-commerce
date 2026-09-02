import { PrismaService } from '../prisma/prisma.service';
import { RecommendationsService } from './recommendations.service';
import { EvaluationService } from './evaluation.service';

describe('EvaluationService', () => {
  it('does not attribute unidentifiable impressions to engagement metrics', async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            categoryId: 'category-1',
            variants: [
              {
                inventory: [
                  {
                    quantityOnHand: 2,
                    quantityReserved: 0,
                    quantityCommitted: 0,
                  },
                ],
              },
            ],
          },
        ]),
      },
      recommendationImpression: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ product: { categoryId: 'category-1' } }])
          .mockResolvedValueOnce([
            {
              userId: null,
              anonymousId: null,
              productId: 'product-1',
              createdAt: new Date('2026-08-30T10:00:00.000Z'),
            },
            {
              userId: 'user-1',
              anonymousId: null,
              productId: 'product-2',
              createdAt: new Date('2026-08-30T10:00:00.000Z'),
            },
          ]),
      },
      behavioralEvent: { findMany: jest.fn().mockResolvedValue([]) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const recommendations = { getPersonalized: jest.fn() };
    const service = new EvaluationService(
      prisma as unknown as PrismaService,
      recommendations as unknown as RecommendationsService,
    );

    const report = await service.evaluate();

    expect(report.coverage.totalImpressions).toBe(2);
    expect(report.catalog.purchasableProducts).toBe(1);
    expect(report.engagement.distinctImpressionPairs).toBe(1);
    expect(report.engagement.clickThroughRate).toBe(0);
    expect(report.engagement.conversionRate).toBe(0);
  });

  it('counts only products the recommendation catalog can actually sell', async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            categoryId: 'category-1',
            variants: [
              {
                inventory: [
                  {
                    quantityOnHand: 0,
                    quantityReserved: 0,
                    quantityCommitted: 0,
                  },
                ],
              },
            ],
          },
          {
            categoryId: 'category-2',
            variants: [],
          },
          {
            categoryId: 'category-3',
            variants: [
              {
                inventory: [
                  {
                    quantityOnHand: 3,
                    quantityReserved: 0,
                    quantityCommitted: 0,
                  },
                ],
              },
            ],
          },
        ]),
      },
      recommendationImpression: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      behavioralEvent: { findMany: jest.fn().mockResolvedValue([]) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const recommendations = { getPersonalized: jest.fn() };

    const report = await new EvaluationService(
      prisma as unknown as PrismaService,
      recommendations as unknown as RecommendationsService,
    ).evaluate();

    expect(report.catalog.purchasableProducts).toBe(1);
    expect(report.coverage.categoryCoverage).toBe(0);
  });
});

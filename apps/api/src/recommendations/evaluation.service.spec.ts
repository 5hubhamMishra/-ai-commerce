import { PrismaService } from '../prisma/prisma.service';
import { RecommendationsService } from './recommendations.service';
import { EvaluationService } from './evaluation.service';

describe('EvaluationService', () => {
  it('does not attribute unidentifiable impressions to engagement metrics', async () => {
    const prisma = {
      product: { count: jest.fn().mockResolvedValue(1) },
      category: { count: jest.fn().mockResolvedValue(1) },
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
    expect(report.engagement.distinctImpressionPairs).toBe(1);
    expect(report.engagement.clickThroughRate).toBe(0);
    expect(report.engagement.conversionRate).toBe(0);
  });
});

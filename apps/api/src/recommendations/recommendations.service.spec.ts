import { RecommendationContext } from '@prisma/client';
import { CacheService } from '../common/cache/cache.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { PrismaService } from '../prisma/prisma.service';
import { BehavioralScoringService } from './behavioral-scoring.service';
import { CollaborativeService } from './collaborative.service';
import {
  RecommendationsService,
  diversify,
  type ScoredProduct,
} from './recommendations.service';

function item(productId: string, score: number): ScoredProduct {
  return { productId, score, reasons: [] };
}

describe('diversify', () => {
  it('keeps original order when everything is already in distinct categories', () => {
    const sorted = [item('a', 10), item('b', 9), item('c', 8)];
    const categories: [string, string][] = [
      ['a', 'cat-1'],
      ['b', 'cat-2'],
      ['c', 'cat-3'],
    ];
    const result = diversify(sorted, categories, 3);
    expect(result.map((r) => r.productId)).toEqual(['a', 'b', 'c']);
  });

  it('caps how many items from one category can occupy the top of the ranking', () => {
    // 3 cat-1 items outrank 3 cat-2 items. With limit 4 and
    // MAX_CATEGORY_SHARE = 0.4, each category is capped at ceil(4*0.4) = 2,
    // so the 3rd-ranked cat-1 item (a3) should lose its slot to a lower-
    // ranked cat-2 item (b2) instead of both top-4 slots going to cat-1.
    const sorted = [
      item('a1', 10),
      item('a2', 9),
      item('a3', 8),
      item('b1', 7),
      item('b2', 6),
      item('b3', 5),
    ];
    const categories: [string, string][] = [
      ['a1', 'cat-1'],
      ['a2', 'cat-1'],
      ['a3', 'cat-1'],
      ['b1', 'cat-2'],
      ['b2', 'cat-2'],
      ['b3', 'cat-2'],
    ];
    const result = diversify(sorted, categories, 4);
    const cat1Count = result.filter((r) => r.productId.startsWith('a')).length;
    expect(cat1Count).toBeLessThanOrEqual(2);
    expect(result.map((r) => r.productId)).toEqual(['a1', 'a2', 'b1', 'b2']);
  });

  it('backfills from deferred items once every category cap is hit and slots remain', () => {
    // Only one category exists, so the cap can never be satisfied by another
    // category — the deferred backfill must still fill up to `limit`.
    const sorted = [item('a', 5), item('b', 4), item('c', 3), item('d', 2)];
    const categories: [string, string][] = [
      ['a', 'cat-1'],
      ['b', 'cat-1'],
      ['c', 'cat-1'],
      ['d', 'cat-1'],
    ];
    const result = diversify(sorted, categories, 4);
    expect(result.map((r) => r.productId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('never returns more than limit items', () => {
    const sorted = Array.from({ length: 20 }, (_, i) => item(`p${i}`, 20 - i));
    const categories: [string, string][] = sorted.map((s, i) => [
      s.productId,
      `cat-${i % 3}`,
    ]);
    const result = diversify(sorted, categories, 5);
    expect(result.length).toBe(5);
  });

  it('treats a product with no known category as its own bucket without throwing', () => {
    const sorted = [item('a', 5), item('b', 4)];
    const result = diversify(sorted, [], 2);
    expect(result.map((r) => r.productId)).toEqual(['a', 'b']);
  });
});

describe('RecommendationsService verification audit', () => {
  let service: RecommendationsService;
  let prisma: {
    profile: { findUnique: jest.Mock };
    product: { findMany: jest.Mock; findUnique: jest.Mock };
    orderItem: { groupBy: jest.Mock };
    wishlistItem: { groupBy: jest.Mock };
    behavioralEvent: { groupBy: jest.Mock };
    productVariant: { findMany: jest.Mock };
    recommendationImpression: { createMany: jest.Mock };
  };
  let cache: { get: jest.Mock; set: jest.Mock };
  let embeddings: { findSimilar: jest.Mock };
  let collaborative: { getCoPurchased: jest.Mock };
  let behavioralScoring: { getAffinity: jest.Mock };

  const baseProduct = {
    id: 'product-1',
    categoryId: 'category-1',
    brandId: 'brand-1',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    variants: [
      {
        price: 100,
        compareAtPrice: null,
        inventory: [
          { quantityOnHand: 1, quantityReserved: 0, quantityCommitted: 0 },
        ],
      },
    ],
  };

  beforeEach(() => {
    prisma = {
      profile: { findUnique: jest.fn().mockResolvedValue(null) },
      product: {
        findMany: jest.fn().mockResolvedValue([baseProduct]),
        findUnique: jest.fn(),
      },
      orderItem: { groupBy: jest.fn().mockResolvedValue([]) },
      wishlistItem: { groupBy: jest.fn().mockResolvedValue([]) },
      behavioralEvent: { groupBy: jest.fn().mockResolvedValue([]) },
      productVariant: { findMany: jest.fn().mockResolvedValue([]) },
      recommendationImpression: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    embeddings = { findSimilar: jest.fn().mockResolvedValue([]) };
    collaborative = { getCoPurchased: jest.fn().mockResolvedValue([]) };
    behavioralScoring = {
      getAffinity: jest.fn().mockResolvedValue({
        categoryAffinity: {},
        brandAffinity: {},
        priceRangeMin: null,
        priceRangeMax: null,
        recentProductIds: [],
        eventCount: 0,
      }),
    };

    service = new RecommendationsService(
      prisma as unknown as PrismaService,
      cache as unknown as CacheService,
      embeddings as unknown as EmbeddingsService,
      collaborative as unknown as CollaborativeService,
      behavioralScoring as unknown as BehavioralScoringService,
    );
  });

  it('does not read behavioral affinity when a user has disabled personalization', async () => {
    prisma.profile.findUnique.mockResolvedValue({
      userId: 'user-1',
      personalizationEnabled: false,
    });
    cache.get.mockResolvedValue([item('cached-product', 1)]);

    const result = await service.getPersonalized({ userId: 'user-1' }, 1);

    expect(behavioralScoring.getAffinity).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        productId: 'product-1',
        score: 0,
        reasons: ['Popular right now'],
      },
    ]);
    expect(prisma.recommendationImpression.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'user-1',
          anonymousId: undefined,
          productId: 'product-1',
          context: RecommendationContext.HOMEPAGE,
          position: 0,
          reason: 'Popular right now',
        },
      ],
    });
  });

  it('bypasses live cache and impression logging for historical backtests', async () => {
    const asOf = new Date('2026-08-24T12:00:00.000Z');

    await service.getPersonalized({ userId: 'user-1' }, 1, asOf);

    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(behavioralScoring.getAffinity).toHaveBeenCalledWith(
      { userId: 'user-1' },
      asOf,
    );
    expect(prisma.recommendationImpression.createMany).not.toHaveBeenCalled();
  });

  it('filters similar-product recommendations down to purchasable products before logging impressions', async () => {
    embeddings.findSimilar.mockResolvedValue([
      { productId: 'draft-product', similarity: 0.95 },
      { productId: 'active-product', similarity: 0.8 },
    ]);
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'active-product',
        variants: [
          {
            inventory: [
              {
                quantityOnHand: 1,
                quantityReserved: 0,
                quantityCommitted: 0,
              },
            ],
          },
        ],
      },
    ]);

    const result = await service.getSimilar(
      { anonymousId: 'anon-1' },
      'seed',
      4,
    );

    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['draft-product', 'active-product'] },
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        variants: {
          where: { isActive: true, deletedAt: null },
          include: {
            inventory: {
              select: {
                quantityOnHand: true,
                quantityReserved: true,
                quantityCommitted: true,
              },
            },
          },
        },
      },
    });
    expect(result).toEqual([
      {
        productId: 'active-product',
        score: 0.8,
        reasons: ['Similar to this product'],
      },
    ]);
    expect(prisma.recommendationImpression.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: undefined,
          anonymousId: 'anon-1',
          productId: 'active-product',
          context: RecommendationContext.SIMILAR_PRODUCTS,
          position: 0,
          reason: 'Similar to this product',
        },
      ],
    });
  });

  it('excludes similar products with no available inventory', async () => {
    embeddings.findSimilar.mockResolvedValue([
      { productId: 'out-of-stock', similarity: 0.95 },
      { productId: 'in-stock', similarity: 0.8 },
    ]);
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'out-of-stock',
        variants: [
          {
            inventory: [
              {
                quantityOnHand: 1,
                quantityReserved: 1,
                quantityCommitted: 0,
              },
            ],
          },
        ],
      },
      {
        id: 'in-stock',
        variants: [
          {
            inventory: [
              {
                quantityOnHand: 1,
                quantityReserved: 0,
                quantityCommitted: 0,
              },
            ],
          },
        ],
      },
    ]);

    await expect(
      service.getSimilar({ anonymousId: 'anon-1' }, 'seed', 4),
    ).resolves.toEqual([
      {
        productId: 'in-stock',
        score: 0.8,
        reasons: ['Similar to this product'],
      },
    ]);
  });

  it('keeps a product when a later active variant has available inventory', async () => {
    embeddings.findSimilar.mockResolvedValue([
      { productId: 'multi-variant', similarity: 0.9 },
    ]);
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'multi-variant',
        variants: [
          {
            inventory: [
              {
                quantityOnHand: 1,
                quantityReserved: 1,
                quantityCommitted: 0,
              },
            ],
          },
          {
            inventory: [
              {
                quantityOnHand: 1,
                quantityReserved: 0,
                quantityCommitted: 0,
              },
            ],
          },
        ],
      },
    ]);

    await expect(
      service.getSimilar({ anonymousId: 'anon-1' }, 'seed', 4),
    ).resolves.toHaveLength(1);
  });

  it('keeps recommendation reads successful when impression logging fails', async () => {
    prisma.recommendationImpression.createMany.mockRejectedValue(
      new Error('analytics write unavailable'),
    );

    await expect(service.getTrending({ userId: 'user-1' }, 1)).resolves.toEqual(
      [
        {
          productId: 'product-1',
          score: 0,
          reasons: ['Popular right now'],
        },
      ],
    );
  });
});

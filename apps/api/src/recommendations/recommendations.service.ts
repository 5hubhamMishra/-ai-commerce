import { Injectable } from '@nestjs/common';
import {
  BehavioralEventType,
  OrderStatus,
  ProductStatus,
  RecommendationContext,
} from '@prisma/client';
import { CACHE_PREFIX } from '../common/cache/cache-keys';
import { CacheService } from '../common/cache/cache.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { PrismaService } from '../prisma/prisma.service';
import { BehavioralScoringService } from './behavioral-scoring.service';
import { CollaborativeService } from './collaborative.service';
import {
  DEFAULT_RECOMMENDATION_LIMIT,
  MAX_CATEGORY_SHARE,
  POPULARITY_WEIGHT_IN_COLD_START,
  RECOMMENDATION_CACHE_TTL_SECONDS,
  SIGNAL_WEIGHTS,
  TRENDING_LOOKBACK_DAYS,
} from './recommendation-config';
import { applyRules } from './recommendation-rules';

export type Identity = { userId?: string; anonymousId?: string };
export type ScoredProduct = {
  productId: string;
  score: number;
  reasons: string[];
};

/** Complementary-category compatibility rules — the same real merchandising
 *  heuristic `apps/web/src/lib/recommend.ts` used, kept as the fallback for
 *  when real collaborative (co-purchase) data is too thin — cold start,
 *  same principle as everywhere else the ranker degrades gracefully instead
 *  of returning nothing. */
const COMPLEMENTARY_CATEGORIES: Record<string, string[]> = {
  Laptops: ['Accessories', 'Gaming'],
  Smartphones: ['Accessories', 'Wearables'],
  Gaming: ['Accessories'],
  Cameras: ['Accessories'],
  Headphones: ['Accessories'],
  Wearables: ['Accessories'],
  'Home Audio': ['Accessories'],
  Accessories: ['Accessories'],
};

const purchasableWhere = {
  status: ProductStatus.ACTIVE,
  deletedAt: null,
} as const;

const purchasableVariantInclude = {
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
} as const;

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly embeddings: EmbeddingsService,
    private readonly collaborative: CollaborativeService,
    private readonly behavioralScoring: BehavioralScoringService,
  ) {}

  // ---- Personalized feed (the full hybrid pipeline) --------------------------

  /** `asOf`: only ever set by EvaluationService's offline backtest, to
   *  compute recommendations as they would genuinely have looked before a
   *  held-out historical purchase — see BehavioralScoringService.getAffinity
   *  for why this matters. Bounds the caller's own behavioral affinity
   *  strictly (the leak that would otherwise make the backtest meaningless:
   *  the held-out order's own ORDER_COMPLETED event). Catalog-wide signals
   *  (popularity, trending, collaborative co-purchase counts) are **not**
   *  independently re-bounded to `asOf` — a known, documented simplification
   *  (see DATABASE.md) rather than full point-in-time reconstruction of
   *  every signal, which real offline recommender evaluations frequently
   *  accept the same trade-off on. When `asOf` is set, results are never
   *  read from or written to the recommendation cache (a historical
   *  snapshot must never leak into — or be overwritten by — a live cache
   *  entry meant for "now"). */
  async getPersonalized(
    identity: Identity,
    limit = DEFAULT_RECOMMENDATION_LIMIT,
    asOf?: Date,
  ): Promise<ScoredProduct[]> {
    const personalizationEnabled =
      await this.isPersonalizationEnabled(identity);
    const canUsePersonalizedCache = !identity.userId || personalizationEnabled;
    const cacheKey = `${CACHE_PREFIX.RECOMMENDATIONS}personalized:${identity.userId ?? identity.anonymousId ?? 'anon'}:${limit}`;
    if (!asOf && canUsePersonalizedCache) {
      const cached = await this.cache.get<ScoredProduct[]>(cacheKey);
      if (cached) return cached;
    }

    const affinity = personalizationEnabled
      ? await this.behavioralScoring.getAffinity(identity, asOf)
      : null;

    const catalogRows = await this.prisma.product.findMany({
      where: purchasableWhere,
      include: {
        variants: purchasableVariantInclude,
      },
    });
    const catalog = catalogRows.filter(hasAvailableVariant);
    if (catalog.length === 0) return [];

    const [popularity, viewsLast7Days, contentScores, collaborativeScores] =
      await Promise.all([
        this.getPopularityScores(),
        this.getRecentViewCounts(TRENDING_LOOKBACK_DAYS),
        this.getContentSimilarityScores(affinity?.recentProductIds ?? []),
        this.getCollaborativeScores(affinity?.recentProductIds ?? []),
      ]);

    const isColdStart = !affinity || affinity.eventCount === 0;

    const scored: ScoredProduct[] = catalog.map((product) => {
      const reasons: string[] = [];
      let score = 0;

      const contentScore = contentScores.get(product.id) ?? 0;
      if (contentScore > 0) {
        score += contentScore * SIGNAL_WEIGHTS.contentSimilarity;
        if (contentScore > 0.5) reasons.push('Similar to items you viewed');
      }

      const collabScore = collaborativeScores.get(product.id) ?? 0;
      if (collabScore > 0) {
        score += collabScore * SIGNAL_WEIGHTS.collaborative;
        if (collabScore > 0.5)
          reasons.push('Bought together with items you viewed');
      }

      if (affinity) {
        const catAff = affinity.categoryAffinity[product.categoryId] ?? 0;
        if (catAff > 0) {
          score += catAff * SIGNAL_WEIGHTS.categoryAffinity;
          if (catAff > 0.5) reasons.push(`You often browse this category`);
        }
        const brandAff = product.brandId
          ? (affinity.brandAffinity[product.brandId] ?? 0)
          : 0;
        if (brandAff > 0) {
          score += brandAff * SIGNAL_WEIGHTS.brandAffinity;
          if (brandAff > 0.5) reasons.push('You frequently view this brand');
        }
        if (
          affinity.priceRangeMin !== null &&
          affinity.priceRangeMax !== null
        ) {
          const price = Number(firstAvailableVariant(product)?.price ?? 0);
          const inRange =
            price >= affinity.priceRangeMin * 0.7 &&
            price <= affinity.priceRangeMax * 1.2;
          if (inRange) {
            score += SIGNAL_WEIGHTS.priceRangeFit;
            reasons.push('Within your usual price range');
          }
        }
      }

      const ruleMatches = applyRules({
        createdAt: product.createdAt,
        hasDiscount: hasDiscount(firstAvailableVariant(product)),
        viewsLast7Days: viewsLast7Days.get(product.id) ?? 0,
      });
      for (const rule of ruleMatches) {
        score += rule.weight * SIGNAL_WEIGHTS.rules;
        reasons.push(rule.reason);
      }

      const pop = popularity.get(product.id) ?? 0;
      const popWeight = isColdStart
        ? POPULARITY_WEIGHT_IN_COLD_START
        : SIGNAL_WEIGHTS.rules;
      score += pop * popWeight;
      if (pop > 0.7 && reasons.length === 0)
        reasons.push('Popular with shoppers');

      if (affinity?.recentProductIds.includes(product.id)) score *= 0.5;

      return {
        productId: product.id,
        score,
        reasons: reasons.length ? reasons.slice(0, 2) : ['Popular right now'],
      };
    });

    const ranked = diversify(
      scored.sort((a, b) => b.score - a.score),
      catalog.map((p) => [p.id, p.categoryId] as const),
      limit,
    );

    // A historical backtest replay is neither a real impression shown to a
    // real user nor something a live "now" request should ever see cached.
    if (!asOf) {
      await this.logImpressions(
        identity,
        ranked,
        RecommendationContext.HOMEPAGE,
      );
      if (canUsePersonalizedCache) {
        await this.cache.set(
          cacheKey,
          ranked,
          RECOMMENDATION_CACHE_TTL_SECONDS,
        );
      }
    }
    return ranked;
  }

  // ---- Content-based similarity ------------------------------------------------

  async getSimilar(
    identity: Identity,
    productId: string,
    limit = 6,
  ): Promise<ScoredProduct[]> {
    const cacheKey = `${CACHE_PREFIX.RECOMMENDATIONS}similar:${productId}:${limit}`;
    const cached = await this.cache.get<ScoredProduct[]>(cacheKey);
    let result = cached;
    if (!result) {
      const similar = await this.embeddings.findSimilar(productId, limit * 2);
      const purchasableIds = await this.filterPurchasable(
        similar.map((s) => s.productId),
      );
      result = similar
        .filter((s) => purchasableIds.has(s.productId))
        .slice(0, limit)
        .map((s) => ({
          productId: s.productId,
          score: s.similarity,
          reasons: ['Similar to this product'],
        }));
      await this.cache.set(cacheKey, result, RECOMMENDATION_CACHE_TTL_SECONDS);
    }
    await this.logImpressions(
      identity,
      result,
      RecommendationContext.SIMILAR_PRODUCTS,
    );
    return result;
  }

  // ---- Collaborative "frequently bought with", with a compatibility fallback ----

  async getFrequentlyBoughtWith(
    identity: Identity,
    productId: string,
    limit = 3,
  ): Promise<ScoredProduct[]> {
    const coPurchased = await this.collaborative.getCoPurchased(
      productId,
      limit * 2,
    );
    const purchasableCoIds = await this.filterPurchasable(
      coPurchased.map((c) => c.productId),
    );
    const maxCount = Math.max(1, ...coPurchased.map((c) => c.coOccurrence));

    let result: ScoredProduct[] = coPurchased
      .filter((c) => purchasableCoIds.has(c.productId))
      .slice(0, limit)
      .map((c) => ({
        productId: c.productId,
        score: c.coOccurrence / maxCount,
        reasons: ['Frequently bought together'],
      }));

    // Cold start: not enough real co-purchase signal yet — fall back to the
    // complementary-category compatibility rule, not to nothing.
    if (result.length < limit) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        include: { category: true },
      });
      if (product) {
        const targetCategories = COMPLEMENTARY_CATEGORIES[
          product.category.name
        ] ?? ['Accessories'];
        const existingIds = new Set(result.map((r) => r.productId));
        const fallbackCandidates = await this.prisma.product.findMany({
          where: {
            ...purchasableWhere,
            id: { notIn: [...existingIds, productId] },
            category: { name: { in: targetCategories } },
          },
          include: { variants: purchasableVariantInclude },
        });
        result = [
          ...result,
          ...fallbackCandidates
            .filter(hasAvailableVariant)
            .slice(0, limit - result.length)
            .map((p) => ({
              productId: p.id,
              score: 0.3,
              reasons: ['Often paired with this product'],
            })),
        ];
      }
    }

    await this.logImpressions(
      identity,
      result,
      RecommendationContext.FREQUENTLY_BOUGHT_WITH,
    );
    return result;
  }

  // ---- Trending / popularity (no identity required) ----------------------------

  async getTrending(
    identity: Identity,
    limit = DEFAULT_RECOMMENDATION_LIMIT,
  ): Promise<ScoredProduct[]> {
    const cacheKey = `${CACHE_PREFIX.RECOMMENDATIONS}trending:${limit}`;
    let result = await this.cache.get<ScoredProduct[]>(cacheKey);
    if (!result) {
      const [viewsLast7Days, popularity] = await Promise.all([
        this.getRecentViewCounts(TRENDING_LOOKBACK_DAYS),
        this.getPopularityScores(),
      ]);
      const catalogRows = await this.prisma.product.findMany({
        where: purchasableWhere,
        include: {
          variants: purchasableVariantInclude,
        },
      });
      const catalog = catalogRows.filter(hasAvailableVariant);
      const scored = catalog.map((product) => {
        const ruleMatches = applyRules({
          createdAt: product.createdAt,
          hasDiscount: hasDiscount(firstAvailableVariant(product)),
          viewsLast7Days: viewsLast7Days.get(product.id) ?? 0,
        });
        const reasons = ruleMatches.map((r) => r.reason);
        const ruleScore = ruleMatches.reduce((sum, r) => sum + r.weight, 0);
        const pop = popularity.get(product.id) ?? 0;
        return {
          productId: product.id,
          score: ruleScore + pop,
          reasons: reasons.length ? reasons.slice(0, 2) : ['Popular right now'],
        };
      });
      result = diversify(
        scored.sort((a, b) => b.score - a.score),
        catalog.map((p) => [p.id, p.categoryId] as const),
        limit,
      );
      await this.cache.set(cacheKey, result, RECOMMENDATION_CACHE_TTL_SECONDS);
    }
    await this.logImpressions(identity, result, RecommendationContext.TRENDING);
    return result;
  }

  // ---- Shared helpers -----------------------------------------------------------

  private async isPersonalizationEnabled(identity: Identity): Promise<boolean> {
    if (!identity.userId) return true;
    const profile = await this.prisma.profile.findUnique({
      where: { userId: identity.userId },
    });
    return profile?.personalizationEnabled ?? true;
  }

  private async getContentSimilarityScores(
    recentProductIds: string[],
  ): Promise<Map<string, number>> {
    const scores = new Map<string, number>();
    for (const anchorId of recentProductIds) {
      const similar = await this.embeddings.findSimilar(anchorId, 20);
      for (const s of similar) {
        scores.set(
          s.productId,
          Math.max(scores.get(s.productId) ?? 0, s.similarity),
        );
      }
    }
    return scores;
  }

  private async getCollaborativeScores(
    recentProductIds: string[],
  ): Promise<Map<string, number>> {
    const raw = new Map<string, number>();
    for (const anchorId of recentProductIds) {
      const co = await this.collaborative.getCoPurchased(anchorId, 20);
      for (const c of co) {
        raw.set(
          c.productId,
          Math.max(raw.get(c.productId) ?? 0, c.coOccurrence),
        );
      }
    }
    const max = Math.max(1, ...raw.values());
    const normalized = new Map<string, number>();
    for (const [id, count] of raw) normalized.set(id, count / max);
    return normalized;
  }

  /** Real popularity signal blended from actual purchase/wishlist/view data
   *  — no rating/review field exists on Product in this backend (unlike the
   *  static seed data `apps/web` reads), so this is what's genuinely
   *  measurable: orders (strongest signal) + wishlists + views. */
  private async getPopularityScores(): Promise<Map<string, number>> {
    const [orderItems, wishlistCounts, viewCounts] = await Promise.all([
      // Only orders that actually got paid count as a "popularity" signal —
      // an abandoned PENDING_PAYMENT cart or a CANCELLED order isn't real
      // purchase interest.
      this.prisma.orderItem.groupBy({
        by: ['variantId'],
        where: {
          order: {
            status: {
              notIn: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED],
            },
          },
        },
        _sum: { quantity: true },
      }),
      this.prisma.wishlistItem.groupBy({
        by: ['productId'],
        _count: { productId: true },
      }),
      this.getRecentViewCounts(365),
    ]);

    const variantIds = orderItems.map((o) => o.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, productId: true },
    });
    const productIdByVariant = new Map(
      variants.map((v) => [v.id, v.productId]),
    );

    const raw = new Map<string, number>();
    for (const row of orderItems) {
      const productId = productIdByVariant.get(row.variantId);
      if (!productId) continue;
      raw.set(
        productId,
        (raw.get(productId) ?? 0) + (row._sum.quantity ?? 0) * 5,
      );
    }
    for (const row of wishlistCounts) {
      raw.set(
        row.productId,
        (raw.get(row.productId) ?? 0) + row._count.productId * 2,
      );
    }
    for (const [productId, count] of viewCounts) {
      raw.set(productId, (raw.get(productId) ?? 0) + count);
    }

    const max = Math.max(1, ...raw.values());
    const normalized = new Map<string, number>();
    for (const [id, value] of raw) normalized.set(id, value / max);
    return normalized;
  }

  private async getRecentViewCounts(
    days: number,
  ): Promise<Map<string, number>> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.behavioralEvent.groupBy({
      by: ['entityId'],
      where: {
        eventType: BehavioralEventType.PRODUCT_VIEWED,
        occurredAt: { gte: since },
        entityId: { not: null },
      },
      _count: { entityId: true },
    });
    return new Map(rows.map((r) => [r.entityId as string, r._count.entityId]));
  }

  private async filterPurchasable(productIds: string[]): Promise<Set<string>> {
    if (productIds.length === 0) return new Set();
    const rows = await this.prisma.product.findMany({
      where: { id: { in: productIds }, ...purchasableWhere },
      select: {
        id: true,
        variants: {
          ...purchasableVariantInclude,
        },
      },
    });
    return new Set(rows.filter(hasAvailableVariant).map((r) => r.id));
  }

  private async logImpressions(
    identity: Identity,
    items: ScoredProduct[],
    context: RecommendationContext,
  ): Promise<void> {
    if (items.length === 0) return;
    await this.prisma.recommendationImpression
      .createMany({
        data: items.map((item, index) => ({
          userId: identity.userId,
          anonymousId: identity.userId ? undefined : identity.anonymousId,
          productId: item.productId,
          context,
          position: index,
          reason: item.reasons[0] ?? '',
        })),
      })
      .catch(() => undefined); // impression logging must never fail the read it's logging
  }
}

function hasDiscount(
  variant: { price: unknown; compareAtPrice: unknown } | undefined,
): boolean {
  if (!variant?.compareAtPrice) return false;
  return Number(variant.compareAtPrice) > Number(variant.price);
}

function firstAvailableVariant<
  T extends {
    inventory: readonly {
      quantityOnHand: number;
      quantityReserved: number;
      quantityCommitted: number;
    }[];
  },
>(product: { variants: readonly T[] }): T | undefined {
  return product.variants.find((variant) =>
    variant.inventory.some(
      (row) =>
        row.quantityOnHand - row.quantityReserved - row.quantityCommitted > 0,
    ),
  );
}

function hasAvailableVariant(product: {
  variants: readonly {
    inventory: readonly {
      quantityOnHand: number;
      quantityReserved: number;
      quantityCommitted: number;
    }[];
  }[];
}): boolean {
  return Boolean(firstAvailableVariant(product));
}

/** Round-robin by category so the top-K isn't dominated by one category —
 *  a simple, real diversity re-rank (not full MMR, but the same goal).
 *  Exported for direct unit testing, same as cosineSimilarity. */
export function diversify(
  sorted: ScoredProduct[],
  categoryByProduct: readonly (readonly [string, string])[],
  limit: number,
): ScoredProduct[] {
  const categoryMap = new Map(categoryByProduct);
  const maxPerCategory = Math.max(1, Math.ceil(limit * MAX_CATEGORY_SHARE));
  const categoryCounts = new Map<string, number>();
  const result: ScoredProduct[] = [];
  const deferred: ScoredProduct[] = [];

  for (const item of sorted) {
    if (result.length >= limit) break;
    const category = categoryMap.get(item.productId) ?? 'unknown';
    const count = categoryCounts.get(category) ?? 0;
    if (count < maxPerCategory) {
      result.push(item);
      categoryCounts.set(category, count + 1);
    } else {
      deferred.push(item);
    }
  }
  for (const item of deferred) {
    if (result.length >= limit) break;
    result.push(item);
  }
  return result;
}

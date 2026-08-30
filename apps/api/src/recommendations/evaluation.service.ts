import { Injectable } from '@nestjs/common';
import {
  BehavioralEventType,
  OrderStatus,
  ProductStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecommendationsService } from './recommendations.service';

export type EvaluationReport = {
  catalog: { purchasableProducts: number };
  coverage: {
    /** Distinct products that have appeared in any recommendation, as a
     *  fraction of the purchasable catalog — "are we only ever recommending
     *  the same handful of items?" */
    productCoverage: number;
    /** Distinct categories represented across all impressions, as a
     *  fraction of all categories with at least one purchasable product. */
    categoryCoverage: number;
    totalImpressions: number;
  };
  engagement: {
    /** Distinct (identity, product) impression pairs later followed by a
     *  RECOMMENDATION_CLICKED event for that same product (any time after
     *  the impression — not a fixed attribution window; see
     *  DATABASE.md for why that's a deliberate v1 simplification). Null
     *  when there are no impressions yet, not 0 — "no data" and "0% CTR"
     *  are different claims. */
    clickThroughRate: number | null;
    conversionRate: number | null;
    distinctImpressionPairs: number;
  };
  offlineBacktest: {
    /** Leave-one-out hit-rate@K: for each customer with at least 2 real
     *  paid orders, hold out their most recent order's product(s), generate
     *  recommendations from only their *earlier* behavior, and check
     *  whether the held-out product appears in the top-K. Standard
     *  recommender-systems methodology, not invented for this project. */
    k: number;
    eligibleUsers: number;
    hitRateAtK: number | null;
  };
};

const DEFAULT_K = 10;

@Injectable()
export class EvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recommendations: RecommendationsService,
  ) {}

  async evaluate(k = DEFAULT_K): Promise<EvaluationReport> {
    const [catalogCount, categoryCount, coverage, engagement, backtest] =
      await Promise.all([
        this.prisma.product.count({
          where: { status: ProductStatus.ACTIVE, deletedAt: null },
        }),
        this.prisma.category.count({
          where: { isActive: true, deletedAt: null, products: { some: {} } },
        }),
        this.computeCoverage(),
        this.computeEngagement(),
        this.runOfflineBacktest(k),
      ]);

    return {
      catalog: { purchasableProducts: catalogCount },
      coverage: {
        productCoverage:
          catalogCount > 0 ? coverage.distinctProducts / catalogCount : 0,
        categoryCoverage:
          categoryCount > 0 ? coverage.distinctCategories / categoryCount : 0,
        totalImpressions: coverage.totalImpressions,
      },
      engagement,
      offlineBacktest: backtest,
    };
  }

  private async computeCoverage() {
    const [totalImpressions, distinctProductRows] = await Promise.all([
      this.prisma.recommendationImpression.count(),
      this.prisma.recommendationImpression.findMany({
        distinct: ['productId'],
        select: { product: { select: { categoryId: true } } },
      }),
    ]);
    const distinctProducts = distinctProductRows.length;
    const distinctCategories = new Set(
      distinctProductRows.map((r) => r.product.categoryId),
    ).size;
    return { totalImpressions, distinctProducts, distinctCategories };
  }

  private async computeEngagement() {
    const impressions = await this.prisma.recommendationImpression.findMany({
      select: {
        userId: true,
        anonymousId: true,
        productId: true,
        createdAt: true,
      },
    });
    if (impressions.length === 0) {
      return {
        clickThroughRate: null,
        conversionRate: null,
        distinctImpressionPairs: 0,
      };
    }

    const pairs = new Map<string, Date>(); // "identity|productId" -> earliest impression time
    for (const imp of impressions) {
      // An impression without either identity can still contribute to catalog
      // coverage, but it cannot be safely attributed to a later event.
      const identity = imp.userId ?? imp.anonymousId;
      if (!identity) continue;
      const key = `${identity}|${imp.productId}`;
      const existing = pairs.get(key);
      if (!existing || imp.createdAt < existing) pairs.set(key, imp.createdAt);
    }

    const clickEvents = await this.prisma.behavioralEvent.findMany({
      where: { eventType: BehavioralEventType.RECOMMENDATION_CLICKED },
      select: {
        userId: true,
        anonymousId: true,
        entityId: true,
        occurredAt: true,
      },
    });
    const purchaseEvents = await this.prisma.behavioralEvent.findMany({
      where: { eventType: BehavioralEventType.RECOMMENDATION_PURCHASED },
      select: {
        userId: true,
        anonymousId: true,
        entityId: true,
        occurredAt: true,
      },
    });

    const matchesAnyPair = (events: typeof clickEvents) => {
      let matched = 0;
      for (const [key, impressedAt] of pairs) {
        const [identity, productId] = key.split('|');
        const hit = events.some(
          (e) =>
            (e.userId === identity || e.anonymousId === identity) &&
            e.entityId === productId &&
            e.occurredAt >= impressedAt,
        );
        if (hit) matched++;
      }
      return matched;
    };

    const clicked = matchesAnyPair(clickEvents);
    const purchased = matchesAnyPair(purchaseEvents);

    return {
      clickThroughRate: clicked / pairs.size,
      conversionRate: purchased / pairs.size,
      distinctImpressionPairs: pairs.size,
    };
  }

  private async runOfflineBacktest(k: number) {
    const paidOrders = await this.prisma.order.findMany({
      where: {
        status: { notIn: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        userId: true,
        createdAt: true,
        items: { select: { variant: { select: { productId: true } } } },
      },
    });

    const byUser = new Map<string, typeof paidOrders>();
    for (const order of paidOrders) {
      const list = byUser.get(order.userId) ?? [];
      list.push(order);
      byUser.set(order.userId, list);
    }

    const eligibleUsers = [...byUser.entries()].filter(
      ([, orders]) => orders.length >= 2,
    );
    if (eligibleUsers.length === 0) {
      return { k, eligibleUsers: 0, hitRateAtK: null };
    }

    let hits = 0;
    for (const [userId, orders] of eligibleUsers) {
      const heldOut = orders[orders.length - 1];
      const heldOutProductIds = new Set(
        heldOut.items.map((i) => i.variant.productId),
      );
      // Recommendations must only ever see behavior strictly before the
      // held-out purchase — anything else would leak the answer into the
      // input, making the metric meaningless.
      const recommended = await this.recommendations.getPersonalized(
        { userId },
        k,
        heldOut.createdAt,
      );
      const recommendedIds = new Set(recommended.map((r) => r.productId));
      const hit = [...heldOutProductIds].some((id) => recommendedIds.has(id));
      if (hit) hits++;
    }

    return {
      k,
      eligibleUsers: eligibleUsers.length,
      hitRateAtK: hits / eligibleUsers.length,
    };
  }
}

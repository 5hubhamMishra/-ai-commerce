import { Injectable, Logger } from '@nestjs/common';
import { BehavioralEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const VIEW_TYPES: BehavioralEventType[] = [
  BehavioralEventType.PRODUCT_VIEWED,
  BehavioralEventType.PRODUCT_CLICKED,
  BehavioralEventType.PRODUCT_WISHLISTED,
  BehavioralEventType.PRODUCT_COMPARED,
  BehavioralEventType.RECOMMENDATION_CLICKED,
  BehavioralEventType.RECOMMENDATION_VIEWED,
  BehavioralEventType.AI_ASSISTANT_PRODUCT_CLICKED,
];

type CountMap = Record<string, number>;

/**
 * A deliberately simple v1 aggregator: raw counters only, no weighting or
 * time decay (that's Phase 7's job — PROMPT 08's "behavioral score, time
 * decay, cold start" — this phase only has to lay a real foundation under
 * it). `applyEvent` is the queue worker's entry point, called at most once
 * per event (guarded by `processedAt`, see schema.prisma) — safe to retry,
 * safe to redeliver, never double-counts.
 */
@Injectable()
export class CustomerProfileService {
  private readonly logger = new Logger(CustomerProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  async applyEvent(eventId: string): Promise<void> {
    const event = await this.prisma.behavioralEvent.findUnique({
      where: { id: eventId },
    });
    if (!event || event.processedAt) return; // already applied, or retried after deletion (privacy erase) — nothing to do.

    const identity = event.userId
      ? { userId: event.userId }
      : { anonymousId: event.anonymousId };

    await this.prisma.$transaction(async (tx) => {
      const delta = await this.computeDelta(tx, event);

      const profile = await this.getOrCreateProfile(tx, identity);
      const merged = this.mergeDelta(profile, delta, event.occurredAt);
      await tx.customerProfile.update({
        where: { id: profile.id },
        data: merged,
      });

      await tx.behavioralEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });
    });
  }

  /** Public read used by the activity/profile endpoints and (from Phase 7
   *  onward) recommendation scoring — computes `segment`/`lifecycleStage`
   *  from the stored counters at read time rather than storing them, so
   *  they're never stale and never a hardcoded assignment. */
  async getForUser(userId: string) {
    const profile = await this.prisma.customerProfile.findUnique({
      where: { userId },
    });
    return profile ? this.toView(profile) : null;
  }

  private toView(profile: {
    categoryViewCounts: Prisma.JsonValue;
    categoryCartCounts: Prisma.JsonValue;
    categoryPurchaseCounts: Prisma.JsonValue;
    brandViewCounts: Prisma.JsonValue;
    priceObservedMin: Prisma.Decimal | null;
    priceObservedMax: Prisma.Decimal | null;
    eventCount: number;
    orderCount: number;
    firstSeenAt: Date;
    lastEventAt: Date | null;
  }) {
    return {
      categoryAffinity: {
        viewed: profile.categoryViewCounts,
        addedToCart: profile.categoryCartCounts,
        purchased: profile.categoryPurchaseCounts,
      },
      brandAffinity: { viewed: profile.brandViewCounts },
      priceRange: {
        min: profile.priceObservedMin ? Number(profile.priceObservedMin) : null,
        max: profile.priceObservedMax ? Number(profile.priceObservedMax) : null,
      },
      eventCount: profile.eventCount,
      orderCount: profile.orderCount,
      segment: this.computeSegment(profile),
      lifecycleStage: this.computeLifecycleStage(profile),
      firstSeenAt: profile.firstSeenAt,
      lastEventAt: profile.lastEventAt,
    };
  }

  /** A small, transparent heuristic — not a fixed enum assigned once and
   *  forgotten. Recomputed from live counters every time it's read. */
  private computeSegment(profile: { eventCount: number; orderCount: number }) {
    if (profile.orderCount >= 3) return 'repeat_buyer';
    if (profile.orderCount >= 1) return 'buyer';
    if (profile.eventCount >= 10) return 'engaged_browser';
    if (profile.eventCount >= 1) return 'browser';
    return 'new';
  }

  private computeLifecycleStage(profile: { orderCount: number }) {
    if (profile.orderCount === 0) return 'prospect';
    if (profile.orderCount === 1) return 'first_time_customer';
    return 'repeat_customer';
  }

  private async computeDelta(
    tx: Prisma.TransactionClient,
    event: { eventType: BehavioralEventType; entityId: string | null },
  ) {
    const delta: {
      categoryView: Record<string, number>;
      categoryCart: Record<string, number>;
      categoryPurchase: Record<string, number>;
      brandView: Record<string, number>;
      prices: number[];
      orderCountDelta: number;
    } = {
      categoryView: {},
      categoryCart: {},
      categoryPurchase: {},
      brandView: {},
      prices: [],
      orderCountDelta: 0,
    };

    if (!event.entityId) return delta;

    if (event.eventType === BehavioralEventType.CATEGORY_VIEWED) {
      delta.categoryView[event.entityId] = 1;
      return delta;
    }

    if (event.eventType === BehavioralEventType.ORDER_COMPLETED) {
      const order = await tx.order.findUnique({
        where: { id: event.entityId },
        include: {
          items: { include: { variant: { include: { product: true } } } },
        },
      });
      if (!order) return delta;
      delta.orderCountDelta = 1;
      for (const item of order.items) {
        const { categoryId } = item.variant.product;
        delta.categoryPurchase[categoryId] =
          (delta.categoryPurchase[categoryId] ?? 0) + 1;
        delta.prices.push(Number(item.unitPrice));
      }
      return delta;
    }

    if (
      VIEW_TYPES.includes(event.eventType) ||
      event.eventType === BehavioralEventType.PRODUCT_ADDED_TO_CART
    ) {
      const product = await tx.product.findUnique({
        where: { id: event.entityId },
        include: {
          variants: { where: { deletedAt: null, isActive: true }, take: 1 },
        },
      });
      if (!product) return delta;
      const bucket =
        event.eventType === BehavioralEventType.PRODUCT_ADDED_TO_CART
          ? delta.categoryCart
          : delta.categoryView;
      bucket[product.categoryId] = (bucket[product.categoryId] ?? 0) + 1;
      if (product.brandId) {
        delta.brandView[product.brandId] =
          (delta.brandView[product.brandId] ?? 0) + 1;
      }
      const price = product.variants[0]?.price;
      if (price !== undefined) delta.prices.push(Number(price));
    }

    return delta;
  }

  private mergeDelta(
    profile: {
      categoryViewCounts: Prisma.JsonValue;
      categoryCartCounts: Prisma.JsonValue;
      categoryPurchaseCounts: Prisma.JsonValue;
      brandViewCounts: Prisma.JsonValue;
      priceObservedMin: Prisma.Decimal | null;
      priceObservedMax: Prisma.Decimal | null;
      eventCount: number;
      orderCount: number;
      lastEventAt: Date | null;
    },
    delta: {
      categoryView: CountMap;
      categoryCart: CountMap;
      categoryPurchase: CountMap;
      brandView: CountMap;
      prices: number[];
      orderCountDelta: number;
    },
    occurredAt: Date,
  ): Prisma.CustomerProfileUpdateInput {
    const addCounts = (
      existing: Prisma.JsonValue,
      delta: CountMap,
    ): CountMap => {
      const base =
        existing && typeof existing === 'object' ? (existing as CountMap) : {};
      const result: CountMap = { ...base };
      for (const [key, value] of Object.entries(delta)) {
        result[key] = (result[key] ?? 0) + value;
      }
      return result;
    };

    const allPrices = [
      ...delta.prices,
      ...(profile.priceObservedMin ? [Number(profile.priceObservedMin)] : []),
      ...(profile.priceObservedMax ? [Number(profile.priceObservedMax)] : []),
    ];

    return {
      categoryViewCounts: addCounts(
        profile.categoryViewCounts,
        delta.categoryView,
      ),
      categoryCartCounts: addCounts(
        profile.categoryCartCounts,
        delta.categoryCart,
      ),
      categoryPurchaseCounts: addCounts(
        profile.categoryPurchaseCounts,
        delta.categoryPurchase,
      ),
      brandViewCounts: addCounts(profile.brandViewCounts, delta.brandView),
      priceObservedMin: allPrices.length ? Math.min(...allPrices) : undefined,
      priceObservedMax: allPrices.length ? Math.max(...allPrices) : undefined,
      eventCount: { increment: 1 },
      orderCount: { increment: delta.orderCountDelta },
      lastEventAt:
        !profile.lastEventAt || occurredAt > profile.lastEventAt
          ? occurredAt
          : undefined,
    };
  }

  private async getOrCreateProfile(
    tx: Prisma.TransactionClient,
    identity: { userId: string } | { anonymousId: string },
  ) {
    const existing = await tx.customerProfile.findFirst({ where: identity });
    if (existing) return existing;
    return tx.customerProfile.create({ data: identity });
  }
}

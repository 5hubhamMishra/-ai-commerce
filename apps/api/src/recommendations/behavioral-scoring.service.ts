import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AFFINITY_HALF_LIFE_MS,
  AFFINITY_LOOKBACK_DAYS,
  EVENT_WEIGHTS,
} from './recommendation-config';

export type AffinitySignal = {
  categoryAffinity: Record<string, number>; // normalized 0-1
  brandAffinity: Record<string, number>; // normalized 0-1
  priceRangeMin: number | null;
  priceRangeMax: number | null;
  recentProductIds: string[]; // most-recently-interacted-with, most recent first
  eventCount: number;
};

const EMPTY_SIGNAL: AffinitySignal = {
  categoryAffinity: {},
  brandAffinity: {},
  priceRangeMin: null,
  priceRangeMax: null,
  recentProductIds: [],
  eventCount: 0,
};

/**
 * "Behavioral scoring" + "time decay" — computed live from the raw
 * `behavioral_events` history each time it's needed, not read off Phase 6's
 * `CustomerProfile` (whose counters are deliberately un-decayed lifetime
 * totals for a different purpose — segment/lifecycle labeling; see
 * DATABASE.md ADR-022). A view from 6 months ago should barely move today's
 * recommendations; a `CustomerProfile` counter can't express that on its
 * own, so recommendation-time affinity is its own computation here.
 */
@Injectable()
export class BehavioralScoringService {
  constructor(private readonly prisma: PrismaService) {}

  /** `asOf` (defaults to now) is the cutoff every query below is bounded
   *  by — not just a display concern. `EvaluationService`'s offline
   *  backtest passes the held-out order's own timestamp here specifically
   *  so a user's *future* behavior (including the very order being held
   *  out) can never leak into the recommendations being scored against it —
   *  without this, a leave-one-out evaluation would be measuring nothing
   *  real. */
  async getAffinity(
    identity: { userId?: string; anonymousId?: string },
    asOf: Date = new Date(),
  ): Promise<AffinitySignal> {
    if (!identity.userId && !identity.anonymousId) return EMPTY_SIGNAL;

    const since = new Date(
      asOf.getTime() - AFFINITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    const events = await this.prisma.behavioralEvent.findMany({
      where: {
        occurredAt: { gte: since, lt: asOf },
        ...(identity.userId
          ? { userId: identity.userId }
          : { anonymousId: identity.anonymousId, userId: null }),
      },
      orderBy: { occurredAt: 'desc' },
      take: 500,
      select: { eventType: true, entityId: true, occurredAt: true },
    });
    if (events.length === 0) return EMPTY_SIGNAL;

    const productIds = [
      ...new Set(
        events.map((e) => e.entityId).filter((id): id is string => !!id),
      ),
    ];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        variants: { where: { isActive: true, deletedAt: null }, take: 1 },
      },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    const now = asOf.getTime();
    const categoryAffinity: Record<string, number> = {};
    const brandAffinity: Record<string, number> = {};
    const prices: number[] = [];
    const recentProductIds: string[] = [];

    for (const event of events) {
      const weight =
        (EVENT_WEIGHTS[event.eventType] ?? 0) *
        timeDecay(event.occurredAt, now);
      if (weight === 0 || !event.entityId) continue;
      const product = productById.get(event.entityId);
      if (!product) continue;

      categoryAffinity[product.categoryId] =
        (categoryAffinity[product.categoryId] ?? 0) + weight;
      if (product.brandId) {
        brandAffinity[product.brandId] =
          (brandAffinity[product.brandId] ?? 0) + weight;
      }
      const price = product.variants[0]?.price;
      if (price !== undefined) prices.push(Number(price));
      if (!recentProductIds.includes(product.id))
        recentProductIds.push(product.id);
    }

    normalize(categoryAffinity);
    normalize(brandAffinity);
    const sortedPrices = [...prices].sort((a, b) => a - b);

    return {
      categoryAffinity,
      brandAffinity,
      priceRangeMin: sortedPrices.length
        ? sortedPrices[Math.floor(sortedPrices.length * 0.1)]
        : null,
      priceRangeMax: sortedPrices.length
        ? sortedPrices[
            Math.min(
              sortedPrices.length - 1,
              Math.floor(sortedPrices.length * 0.9),
            )
          ]
        : null,
      recentProductIds: recentProductIds.slice(0, 5),
      eventCount: events.length,
    };
  }
}

function timeDecay(occurredAt: Date, now: number): number {
  const age = Math.max(0, now - occurredAt.getTime());
  return Math.pow(0.5, age / AFFINITY_HALF_LIFE_MS);
}

function normalize(map: Record<string, number>) {
  const max = Math.max(0, ...Object.values(map));
  if (max <= 0) return;
  for (const key of Object.keys(map)) map[key] = map[key] / max;
}

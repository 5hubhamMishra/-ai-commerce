import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type CoPurchaseResult = { productId: string; coOccurrence: number };

/** Only orders that actually got paid count as a co-purchase signal — an
 *  abandoned PENDING_PAYMENT cart or a CANCELLED order isn't real evidence
 *  two products get bought together. */
const UNPAID_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.CANCELLED,
];
const PAID_ORDER_WHERE = { status: { notIn: UNPAID_STATUSES } };

/**
 * Real collaborative filtering — "customers who bought X also bought Y" —
 * computed from actual `orders`/`order_items` co-occurrence, not a hardcoded
 * complementary-category table. No seed data creates orders (same "don't fake
 * a transaction history"
 * precedent as everywhere else in this codebase), so this genuinely returns
 * empty until real purchases happen — the honest, unforced cold-start case
 * `RecommendationsService` falls back from, not a special-cased branch.
 */
@Injectable()
export class CollaborativeService {
  constructor(private readonly prisma: PrismaService) {}

  async getCoPurchased(
    productId: string,
    limit: number,
  ): Promise<CoPurchaseResult[]> {
    const containingOrders = await this.prisma.orderItem.findMany({
      where: { variant: { productId }, order: PAID_ORDER_WHERE },
      select: { orderId: true },
      distinct: ['orderId'],
    });
    if (containingOrders.length === 0) return [];

    const orderIds = containingOrders.map((o) => o.orderId);
    const coItems = await this.prisma.orderItem.findMany({
      where: {
        orderId: { in: orderIds },
        variant: { productId: { not: productId } },
      },
      select: { variant: { select: { productId: true } } },
    });

    const counts = new Map<string, number>();
    for (const item of coItems) {
      const pid = item.variant.productId;
      counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([id, coOccurrence]) => ({ productId: id, coOccurrence }))
      .sort((a, b) => b.coOccurrence - a.coOccurrence)
      .slice(0, limit);
  }
}

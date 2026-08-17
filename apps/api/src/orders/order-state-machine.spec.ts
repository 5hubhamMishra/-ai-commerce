import { ConflictException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import {
  ADMIN_SETTABLE_STATUSES,
  CANCELLABLE_STATUSES,
  assertTransition,
  canTransition,
} from './order-state-machine';

describe('order-state-machine', () => {
  it('allows the full fulfillment happy path in order', () => {
    const happyPath: OrderStatus[] = [
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.PAID,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.PACKED,
      OrderStatus.SHIPPED,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
    ];
    for (let i = 0; i < happyPath.length - 1; i++) {
      expect(canTransition(happyPath[i], happyPath[i + 1])).toBe(true);
    }
  });

  it('allows cancellation only from PENDING_PAYMENT and CONFIRMED', () => {
    expect(canTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED)).toBe(true);
    expect(canTransition(OrderStatus.CONFIRMED, OrderStatus.CANCELLED)).toBe(true);
    expect(canTransition(OrderStatus.PROCESSING, OrderStatus.CANCELLED)).toBe(false);
    expect(canTransition(OrderStatus.SHIPPED, OrderStatus.CANCELLED)).toBe(false);
    expect(CANCELLABLE_STATUSES).toEqual([
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.CONFIRMED,
    ]);
  });

  it('rejects arbitrary/skipped transitions', () => {
    expect(canTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.DELIVERED)).toBe(false);
    expect(canTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.SHIPPED)).toBe(false);
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.PENDING_PAYMENT)).toBe(false);
    expect(canTransition(OrderStatus.CANCELLED, OrderStatus.CONFIRMED)).toBe(false);
  });

  it('throws a ConflictException with a stable error code for an illegal transition', () => {
    expect(() => assertTransition(OrderStatus.CANCELLED, OrderStatus.PAID)).toThrow(
      ConflictException,
    );
    try {
      assertTransition(OrderStatus.CANCELLED, OrderStatus.PAID);
      fail('expected assertTransition to throw');
    } catch (error) {
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'INVALID_ORDER_TRANSITION',
      });
    }
  });

  it('does not throw for a legal transition', () => {
    expect(() => assertTransition(OrderStatus.PAID, OrderStatus.CONFIRMED)).not.toThrow();
  });

  it('keeps return/refund states reachable in the map even though Phase 3 exposes no endpoint for them', () => {
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.RETURN_REQUESTED)).toBe(true);
    expect(canTransition(OrderStatus.RETURN_REQUESTED, OrderStatus.REFUND_PENDING)).toBe(true);
    expect(canTransition(OrderStatus.REFUND_PENDING, OrderStatus.REFUNDED)).toBe(true);
  });

  it('restricts admin-settable statuses to the fulfillment happy path', () => {
    expect(ADMIN_SETTABLE_STATUSES).toEqual([
      OrderStatus.PROCESSING,
      OrderStatus.PACKED,
      OrderStatus.SHIPPED,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
    ]);
    expect(ADMIN_SETTABLE_STATUSES).not.toContain(OrderStatus.RETURN_REQUESTED);
    expect(ADMIN_SETTABLE_STATUSES).not.toContain(OrderStatus.CANCELLED);
  });
});

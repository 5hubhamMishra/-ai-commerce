import { ConflictException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

/**
 * Explicit legal transitions (spec: ORDER STATE MACHINE — "Do not allow arbitrary
 * frontend-controlled state transitions"). Every transition in this codebase must
 * go through `assertTransition`; nothing writes `orders.status` directly.
 *
 * RETURN_REQUESTED / REFUND_PENDING / REFUNDED / RETURNED / REPLACEMENT / EXCHANGED
 * are reachable in this map (so the schema/state-machine is complete per the spec's
 * target diagram) but Phase 3 exposes no endpoint that triggers them — the actual
 * return/refund/replacement business logic (eligibility, approval, pickup, inspection)
 * is PROMPT 05 / Phase 4 (Post-Purchase) territory. See docs/PROJECT_PROGRESS.md.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: [OrderStatus.PAID, OrderStatus.CANCELLED],
  PAID: [OrderStatus.CONFIRMED],
  CONFIRMED: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  PROCESSING: [OrderStatus.PACKED],
  PACKED: [OrderStatus.SHIPPED],
  SHIPPED: [OrderStatus.OUT_FOR_DELIVERY],
  OUT_FOR_DELIVERY: [OrderStatus.DELIVERED],
  DELIVERED: [OrderStatus.RETURN_REQUESTED],
  CANCELLED: [],
  RETURN_REQUESTED: [OrderStatus.REFUND_PENDING, OrderStatus.RETURNED],
  REFUND_PENDING: [OrderStatus.REFUNDED],
  REFUNDED: [],
  RETURNED: [
    OrderStatus.REPLACEMENT,
    OrderStatus.EXCHANGED,
    OrderStatus.REFUNDED,
  ],
  REPLACEMENT: [],
  EXCHANGED: [],
};

/** Statuses reserved for CONFIRMED/before — inventory is still just "reserved", not "committed". */
export const CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.CONFIRMED,
];

/** The subset of transitions an admin may trigger directly via PATCH /orders/admin/:id/status
 *  in Phase 3 — the fulfillment happy path. Return/refund transitions stay unreachable until
 *  Phase 4 builds the endpoints (and side effects) that should drive them. */
export const ADMIN_SETTABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PROCESSING,
  OrderStatus.PACKED,
  OrderStatus.SHIPPED,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new ConflictException({
      code: 'INVALID_ORDER_TRANSITION',
      message: `Cannot transition an order from ${from} to ${to}.`,
    });
  }
}

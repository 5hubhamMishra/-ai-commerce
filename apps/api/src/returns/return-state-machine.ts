import { ConflictException } from '@nestjs/common';
import { ReturnStatus } from '@prisma/client';

/** Explicit legal transitions (spec: "Add all required state machines. Prevent
 *  invalid transitions.") — mirrors orders/order-state-machine.ts's pattern. */
const TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: [
    ReturnStatus.APPROVED,
    ReturnStatus.REJECTED,
    ReturnStatus.CANCELLED,
  ],
  APPROVED: [ReturnStatus.PICKUP_SCHEDULED, ReturnStatus.CANCELLED],
  PICKUP_SCHEDULED: [ReturnStatus.PICKED_UP],
  PICKED_UP: [ReturnStatus.INSPECTING],
  // Inspection can fail (item doesn't qualify after all) — reject rather than complete.
  INSPECTING: [ReturnStatus.COMPLETED, ReturnStatus.REJECTED],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: [],
};

/** Only the customer, and only before any admin action has been taken. */
export const CUSTOMER_CANCELLABLE_STATUSES: ReturnStatus[] = [
  ReturnStatus.REQUESTED,
];

export function canTransition(from: ReturnStatus, to: ReturnStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertReturnTransition(
  from: ReturnStatus,
  to: ReturnStatus,
): void {
  if (!canTransition(from, to)) {
    throw new ConflictException({
      code: 'INVALID_RETURN_TRANSITION',
      message: `Cannot transition a return request from ${from} to ${to}.`,
    });
  }
}

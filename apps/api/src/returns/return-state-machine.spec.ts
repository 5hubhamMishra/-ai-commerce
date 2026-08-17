import { ConflictException } from '@nestjs/common';
import { ReturnStatus } from '@prisma/client';
import {
  CUSTOMER_CANCELLABLE_STATUSES,
  assertReturnTransition,
  canTransition,
} from './return-state-machine';

describe('return-state-machine', () => {
  it('allows the full review pipeline in order', () => {
    const path: ReturnStatus[] = [
      ReturnStatus.REQUESTED,
      ReturnStatus.APPROVED,
      ReturnStatus.PICKUP_SCHEDULED,
      ReturnStatus.PICKED_UP,
      ReturnStatus.INSPECTING,
      ReturnStatus.COMPLETED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it('allows rejection from REQUESTED and from a failed inspection', () => {
    expect(canTransition(ReturnStatus.REQUESTED, ReturnStatus.REJECTED)).toBe(
      true,
    );
    expect(canTransition(ReturnStatus.INSPECTING, ReturnStatus.REJECTED)).toBe(
      true,
    );
    expect(canTransition(ReturnStatus.APPROVED, ReturnStatus.REJECTED)).toBe(
      false,
    );
  });

  it('only allows customer cancellation from REQUESTED', () => {
    expect(CUSTOMER_CANCELLABLE_STATUSES).toEqual([ReturnStatus.REQUESTED]);
    expect(canTransition(ReturnStatus.REQUESTED, ReturnStatus.CANCELLED)).toBe(
      true,
    );
    expect(canTransition(ReturnStatus.APPROVED, ReturnStatus.CANCELLED)).toBe(
      true,
    );
    expect(canTransition(ReturnStatus.PICKED_UP, ReturnStatus.CANCELLED)).toBe(
      false,
    );
  });

  it('rejects skipped or backward transitions', () => {
    expect(canTransition(ReturnStatus.REQUESTED, ReturnStatus.COMPLETED)).toBe(
      false,
    );
    expect(canTransition(ReturnStatus.REQUESTED, ReturnStatus.PICKED_UP)).toBe(
      false,
    );
    expect(canTransition(ReturnStatus.COMPLETED, ReturnStatus.REQUESTED)).toBe(
      false,
    );
  });

  it('is fully terminal after COMPLETED/REJECTED/CANCELLED', () => {
    expect(canTransition(ReturnStatus.COMPLETED, ReturnStatus.APPROVED)).toBe(
      false,
    );
    expect(canTransition(ReturnStatus.REJECTED, ReturnStatus.REQUESTED)).toBe(
      false,
    );
    expect(canTransition(ReturnStatus.CANCELLED, ReturnStatus.REQUESTED)).toBe(
      false,
    );
  });

  it('throws a ConflictException with a stable error code for an illegal transition', () => {
    expect(() =>
      assertReturnTransition(ReturnStatus.COMPLETED, ReturnStatus.APPROVED),
    ).toThrow(ConflictException);
    try {
      assertReturnTransition(ReturnStatus.COMPLETED, ReturnStatus.APPROVED);
      fail('expected assertReturnTransition to throw');
    } catch (error) {
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'INVALID_RETURN_TRANSITION',
      });
    }
  });
});

import type { OrderStatus } from '@ai-commerce/types';
import { ORDER_PROGRESS_STAGES, isCancellable, isOnHappyPath, progressStageIndex } from './order-status';

const OFF_PATH_STATUSES: OrderStatus[] = [
  'CANCELLED',
  'RETURN_REQUESTED',
  'REFUND_PENDING',
  'REFUNDED',
  'RETURNED',
  'REPLACEMENT',
  'EXCHANGED',
];

describe('progressStageIndex', () => {
  it('returns -1 for a status off the happy path', () => {
    expect(progressStageIndex('CANCELLED')).toBe(-1);
  });

  it('returns the correct index for each happy-path stage', () => {
    ORDER_PROGRESS_STAGES.forEach((status, i) => {
      expect(progressStageIndex(status)).toBe(i);
    });
  });
});

describe('isOnHappyPath', () => {
  it('is true for PENDING_PAYMENT and PAID, before the tracker starts', () => {
    expect(isOnHappyPath('PENDING_PAYMENT')).toBe(true);
    expect(isOnHappyPath('PAID')).toBe(true);
  });

  it('is true for every ORDER_PROGRESS_STAGES member', () => {
    for (const status of ORDER_PROGRESS_STAGES) {
      expect(isOnHappyPath(status)).toBe(true);
    }
  });

  it('is false for every off-path status', () => {
    for (const status of OFF_PATH_STATUSES) {
      expect(isOnHappyPath(status)).toBe(false);
    }
  });
});

describe('isCancellable', () => {
  it('is true only for PENDING_PAYMENT and CONFIRMED', () => {
    expect(isCancellable('PENDING_PAYMENT')).toBe(true);
    expect(isCancellable('CONFIRMED')).toBe(true);
  });

  it('is false for every other status', () => {
    const allStatuses: OrderStatus[] = [
      'PAID',
      'PROCESSING',
      'PACKED',
      'SHIPPED',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      ...OFF_PATH_STATUSES,
    ];
    for (const status of allStatuses) {
      expect(isCancellable(status)).toBe(false);
    }
  });
});

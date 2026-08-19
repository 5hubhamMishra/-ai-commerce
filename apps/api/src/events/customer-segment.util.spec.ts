import { computeLifecycleStage, computeSegment } from './customer-segment.util';

describe('computeSegment', () => {
  it('classifies a profile with no activity as new', () => {
    expect(computeSegment({ eventCount: 0, orderCount: 0 })).toBe('new');
  });

  it('classifies 1-9 events with no orders as browser', () => {
    expect(computeSegment({ eventCount: 1, orderCount: 0 })).toBe('browser');
    expect(computeSegment({ eventCount: 9, orderCount: 0 })).toBe('browser');
  });

  it('classifies 10+ events with no orders as engaged_browser', () => {
    expect(computeSegment({ eventCount: 10, orderCount: 0 })).toBe(
      'engaged_browser',
    );
  });

  it('classifies 1-2 orders as buyer regardless of event count', () => {
    expect(computeSegment({ eventCount: 0, orderCount: 1 })).toBe('buyer');
    expect(computeSegment({ eventCount: 50, orderCount: 2 })).toBe('buyer');
  });

  it('classifies 3+ orders as repeat_buyer', () => {
    expect(computeSegment({ eventCount: 0, orderCount: 3 })).toBe(
      'repeat_buyer',
    );
    expect(computeSegment({ eventCount: 0, orderCount: 10 })).toBe(
      'repeat_buyer',
    );
  });
});

describe('computeLifecycleStage', () => {
  it('classifies zero orders as prospect', () => {
    expect(computeLifecycleStage({ orderCount: 0 })).toBe('prospect');
  });

  it('classifies exactly one order as first_time_customer', () => {
    expect(computeLifecycleStage({ orderCount: 1 })).toBe(
      'first_time_customer',
    );
  });

  it('classifies two or more orders as repeat_customer', () => {
    expect(computeLifecycleStage({ orderCount: 2 })).toBe('repeat_customer');
    expect(computeLifecycleStage({ orderCount: 20 })).toBe('repeat_customer');
  });
});

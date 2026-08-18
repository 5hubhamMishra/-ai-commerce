import { applyRules } from './recommendation-rules';
import {
  NEW_ARRIVAL_WINDOW_DAYS,
  TRENDING_MIN_VIEWS,
} from './recommendation-config';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

describe('applyRules', () => {
  it('matches new_arrival for a recently created product', () => {
    const matches = applyRules({
      createdAt: daysAgo(NEW_ARRIVAL_WINDOW_DAYS - 1),
      hasDiscount: false,
      viewsLast7Days: 0,
    });
    expect(matches.map((m) => m.name)).toContain('new_arrival');
  });

  it('does not match new_arrival once the window has passed', () => {
    const matches = applyRules({
      createdAt: daysAgo(NEW_ARRIVAL_WINDOW_DAYS + 1),
      hasDiscount: false,
      viewsLast7Days: 0,
    });
    expect(matches.map((m) => m.name)).not.toContain('new_arrival');
  });

  it('matches price_drop only when the product actually has a discount', () => {
    const withDiscount = applyRules({
      createdAt: daysAgo(365),
      hasDiscount: true,
      viewsLast7Days: 0,
    });
    expect(withDiscount.map((m) => m.name)).toContain('price_drop');

    const withoutDiscount = applyRules({
      createdAt: daysAgo(365),
      hasDiscount: false,
      viewsLast7Days: 0,
    });
    expect(withoutDiscount.map((m) => m.name)).not.toContain('price_drop');
  });

  it('matches trending only at or above the view threshold', () => {
    const below = applyRules({
      createdAt: daysAgo(365),
      hasDiscount: false,
      viewsLast7Days: TRENDING_MIN_VIEWS - 1,
    });
    expect(below.map((m) => m.name)).not.toContain('trending');

    const atThreshold = applyRules({
      createdAt: daysAgo(365),
      hasDiscount: false,
      viewsLast7Days: TRENDING_MIN_VIEWS,
    });
    expect(atThreshold.map((m) => m.name)).toContain('trending');
  });

  it('returns no matches for an old, full-price, unviewed product', () => {
    const matches = applyRules({
      createdAt: daysAgo(365),
      hasDiscount: false,
      viewsLast7Days: 0,
    });
    expect(matches).toEqual([]);
  });

  it('can match multiple rules at once, each with its own reason', () => {
    const matches = applyRules({
      createdAt: daysAgo(1),
      hasDiscount: true,
      viewsLast7Days: TRENDING_MIN_VIEWS + 5,
    });
    expect(matches.map((m) => m.name).sort()).toEqual(
      ['new_arrival', 'price_drop', 'trending'].sort(),
    );
    expect(new Set(matches.map((m) => m.reason)).size).toBe(matches.length);
  });
});

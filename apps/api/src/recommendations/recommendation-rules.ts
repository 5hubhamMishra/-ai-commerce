import {
  NEW_ARRIVAL_WINDOW_DAYS,
  TRENDING_MIN_VIEWS,
} from './recommendation-config';

export type RuleContext = {
  createdAt: Date;
  hasDiscount: boolean;
  viewsLast7Days: number;
};

export type RuleMatch = { name: string; weight: number; reason: string };

type Rule = {
  name: string;
  weight: number;
  reason: string;
  applies: (ctx: RuleContext) => boolean;
};

/**
 * The "rule engine" — a small, named, composable list rather than one
 * hardcoded scoring function baked into the ranker. Each rule is
 * independently testable and the weight for each lives in one place
 * (`recommendation-config.ts`... today the weight is inline per rule, which
 * is the same "centralized, not scattered" bar the reference
 * implementation's `EVENT_WEIGHTS` set, just scoped to this one file since
 * rules are inherently more than a single number each). Extending this list
 * is how a real merchandising rule (e.g. "seller-promoted," "low stock —
 * act fast") gets added later, without touching the ranker itself.
 */
export const RULES: Rule[] = [
  {
    name: 'new_arrival',
    weight: 0.5,
    reason: 'New arrival',
    applies: (ctx) => daysSince(ctx.createdAt) <= NEW_ARRIVAL_WINDOW_DAYS,
  },
  {
    name: 'price_drop',
    weight: 0.4,
    reason: 'Price drop',
    applies: (ctx) => ctx.hasDiscount,
  },
  {
    name: 'trending',
    weight: 0.6,
    reason: 'Trending now',
    applies: (ctx) => ctx.viewsLast7Days >= TRENDING_MIN_VIEWS,
  },
];

export function applyRules(ctx: RuleContext): RuleMatch[] {
  return RULES.filter((r) => r.applies(ctx)).map((r) => ({
    name: r.name,
    weight: r.weight,
    reason: r.reason,
  }));
}

function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

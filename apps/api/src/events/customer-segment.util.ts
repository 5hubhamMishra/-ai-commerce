/**
 * Shared, transparent heuristics for deriving a customer's segment and
 * lifecycle stage from their CustomerProfile counters. Extracted out of
 * CustomerProfileService (its original home since Phase 6) so Phase 10's
 * SegmentationService can compute the exact same real classification in
 * bulk across every profile without duplicating — and risking drifting
 * from — the single-profile definition used everywhere else (recommendation
 * scoring, the customer's own /users/me/behavioral-profile read). Recomputed
 * at read time, never stored — see CustomerProfile's own doc comment in
 * schema.prisma.
 */

export function computeSegment(profile: {
  eventCount: number;
  orderCount: number;
}): string {
  if (profile.orderCount >= 3) return 'repeat_buyer';
  if (profile.orderCount >= 1) return 'buyer';
  if (profile.eventCount >= 10) return 'engaged_browser';
  if (profile.eventCount >= 1) return 'browser';
  return 'new';
}

export function computeLifecycleStage(profile: { orderCount: number }): string {
  if (profile.orderCount === 0) return 'prospect';
  if (profile.orderCount === 1) return 'first_time_customer';
  return 'repeat_customer';
}

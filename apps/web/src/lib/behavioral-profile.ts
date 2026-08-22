import type { BehavioralProfileView } from "@ai-commerce/types";

export const SEGMENT_LABELS: Record<BehavioralProfileView["segment"], string> = {
  repeat_buyer: "Repeat Buyer",
  buyer: "Buyer",
  engaged_browser: "Engaged Browser",
  browser: "Browser",
  new: "New Customer",
};

export const LIFECYCLE_LABELS: Record<BehavioralProfileView["lifecycleStage"], string> = {
  prospect: "Discovery",
  first_time_customer: "First-Time Customer",
  repeat_customer: "Repeat Customer",
};

/** Normalizes a real `{viewed, addedToCart, purchased}`-shaped affinity map (category) or a
 *  `{viewed}`-shaped one (brand) into one combined, sorted `[id, score]` ranking — weighting
 *  purchase signal above cart-add above a plain view, matching the old client-only profile's
 *  intent-weighting spirit without needing its exact numbers. */
export function rankAffinity(
  maps: { viewed: Record<string, number>; addedToCart?: Record<string, number>; purchased?: Record<string, number> },
): [string, number][] {
  const totals = new Map<string, number>();
  for (const [id, count] of Object.entries(maps.viewed)) totals.set(id, (totals.get(id) ?? 0) + count);
  for (const [id, count] of Object.entries(maps.addedToCart ?? {})) totals.set(id, (totals.get(id) ?? 0) + count * 3);
  for (const [id, count] of Object.entries(maps.purchased ?? {})) totals.set(id, (totals.get(id) ?? 0) + count * 8);
  const max = Math.max(1, ...totals.values());
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([id, score]) => [id, score / max]);
}

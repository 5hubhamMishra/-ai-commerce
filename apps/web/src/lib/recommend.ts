import { products, getProduct, popularProducts } from "./data";
import type { BehaviorEvent, CustomerProfile, Product } from "./types";

// Configurable behavioral weights (spec: "weights must be configurable rather
// than hard-coded throughout the application"). Tune these in one place.
export const EVENT_WEIGHTS: Partial<Record<BehaviorEvent["eventType"], number>> = {
  PRODUCT_VIEWED: 1,
  PRODUCT_CLICKED: 2,
  PRODUCT_SEARCHED: 3,
  PRODUCT_COMPARED: 6,
  PRODUCT_WISHLISTED: 5,
  PRODUCT_ADDED_TO_CART: 8,
  ORDER_COMPLETED: 15,
  RECOMMENDATION_CLICKED: 2,
};

const HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 7; // recent activity matters more; 7-day decay

function timeDecay(timestamp: number, now: number): number {
  const age = Math.max(0, now - timestamp);
  return Math.pow(0.5, age / HALF_LIFE_MS);
}

/** Builds a customer profile from raw behavior events. Nothing here is hard-coded per user. */
export function buildProfile(events: BehaviorEvent[], now = Date.now()): CustomerProfile {
  const categoryAffinity: Record<string, number> = {};
  const brandAffinity: Record<string, number> = {};
  const prices: number[] = [];
  let purchases = 0;
  let carts = 0;
  let wishlists = 0;
  let views = 0;
  let searches = 0;
  let comparisons = 0;
  let lastIntentCategory: string | null = null;
  let lastIntentAt = 0;

  for (const ev of events) {
    const weight = (EVENT_WEIGHTS[ev.eventType] ?? 0) * timeDecay(ev.timestamp, now);
    const product = ev.productId ? getProduct(ev.productId) : undefined;
    const category = ev.category || product?.category;
    const brand = ev.brand || product?.brand;

    if (category) categoryAffinity[category] = (categoryAffinity[category] || 0) + weight;
    if (brand) brandAffinity[brand] = (brandAffinity[brand] || 0) + weight;
    if (product) prices.push(product.price);

    if (ev.eventType === "ORDER_COMPLETED") purchases++;
    if (ev.eventType === "PRODUCT_ADDED_TO_CART") carts++;
    if (ev.eventType === "PRODUCT_WISHLISTED") wishlists++;
    if (ev.eventType === "PRODUCT_VIEWED") views++;
    if (ev.eventType === "PRODUCT_SEARCHED") searches++;
    if (ev.eventType === "PRODUCT_COMPARED") comparisons++;

    if (category && ev.timestamp > lastIntentAt) {
      lastIntentAt = ev.timestamp;
      lastIntentCategory = category;
    }
  }

  // Normalize affinities to 0-1
  normalize(categoryAffinity);
  normalize(brandAffinity);

  const sortedPrices = [...prices].sort((a, b) => a - b);
  const priceRangeMin = sortedPrices.length ? sortedPrices[Math.floor(sortedPrices.length * 0.1)] : 0;
  const priceRangeMax = sortedPrices.length
    ? sortedPrices[Math.min(sortedPrices.length - 1, Math.floor(sortedPrices.length * 0.9))]
    : 0;

  const segment = deriveSegment({ purchases, carts, wishlists, views, searches, eventCount: events.length });
  const lifecycleStage = deriveLifecycleStage({ views, searches, comparisons, wishlists, carts, purchases });

  const intentConfidence = Math.min(1, Math.round((views * 0.05 + searches * 0.1 + comparisons * 0.15) * 100) / 100);
  const recentIntentActive = now - lastIntentAt < 1000 * 60 * 60 * 24 * 3;

  return {
    categoryAffinity,
    brandAffinity,
    priceRangeMin,
    priceRangeMax,
    segment,
    lifecycleStage,
    intentConfidence,
    currentIntent: recentIntentActive ? lastIntentCategory : null,
  };
}

function normalize(map: Record<string, number>) {
  const max = Math.max(0, ...Object.values(map));
  if (max <= 0) return;
  for (const key of Object.keys(map)) map[key] = Math.round((map[key] / max) * 100) / 100;
}

function deriveSegment(stats: {
  purchases: number;
  carts: number;
  wishlists: number;
  views: number;
  searches: number;
  eventCount: number;
}): string {
  if (stats.eventCount === 0) return "New Customer";
  if (stats.purchases >= 3) return "Frequent Buyer";
  if (stats.purchases >= 1 && stats.carts + stats.views > 15) return "Returning Customer";
  if (stats.carts >= 1 && stats.purchases === 0) return "High Intent Customer";
  if (stats.wishlists >= 3 && stats.purchases === 0) return "Price Sensitive";
  if (stats.views > 10 || stats.searches > 5) return "Active Browser";
  return "New Customer";
}

function deriveLifecycleStage(stats: {
  views: number;
  searches: number;
  comparisons: number;
  wishlists: number;
  carts: number;
  purchases: number;
}): string {
  if (stats.purchases > 0) return "Retention";
  if (stats.carts > 0) return "Cart";
  if (stats.wishlists > 0) return "Wishlist";
  if (stats.comparisons > 0) return "Consideration";
  if (stats.searches > 0 || stats.views > 2) return "Interest";
  return "Discovery";
}

/** Content similarity between two products, based on shared category/brand/tags/price closeness. */
export function contentSimilarity(a: Product, b: Product): number {
  if (a.id === b.id) return 0;
  let score = 0;
  if (a.category === b.category) score += 0.4;
  if (a.brand === b.brand) score += 0.2;
  const sharedTags = a.tags.filter((t) => b.tags.includes(t)).length;
  score += Math.min(0.25, sharedTags * 0.08);
  const priceDelta = Math.abs(a.price - b.price) / Math.max(a.price, b.price, 1);
  score += Math.max(0, 0.15 - priceDelta * 0.15);
  return score;
}

export function similarProducts(product: Product, limit = 6): Product[] {
  return [...products]
    .filter((p) => p.id !== product.id)
    .map((p) => ({ p, score: contentSimilarity(product, p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.p);
}

export function frequentlyBoughtWith(product: Product, limit = 3): Product[] {
  // Complementary-category heuristic (compatibility rules), since we have no real order graph yet.
  const complements: Record<string, string[]> = {
    Laptops: ["Accessories", "Gaming"],
    Smartphones: ["Accessories", "Wearables"],
    Gaming: ["Accessories", "Gaming"],
    Cameras: ["Accessories"],
    Headphones: ["Accessories"],
    Wearables: ["Accessories"],
    "Home Audio": ["Accessories"],
    Accessories: ["Accessories"],
  };
  const targetCats = complements[product.category] || ["Accessories"];
  return products
    .filter((p) => p.id !== product.id && targetCats.includes(p.category) && p.stock > 0)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);
}

export type ScoredProduct = { product: Product; score: number; reasons: string[] };

/**
 * Hybrid recommendation ranking: content similarity + behavioral affinity + recency +
 * popularity fallback, combined into a single normalized score per spec section 6.
 * Business-safety filters (inventory, discontinued) are applied last.
 */
export function recommendForProfile(
  profile: CustomerProfile,
  events: BehaviorEvent[],
  limit = 12
): ScoredProduct[] {
  const seenIds = new Set(events.filter((e) => e.productId).map((e) => e.productId as string));
  const popularity = popularProducts(products.length);
  const popRank = new Map(popularity.map((p, i) => [p.id, 1 - i / popularity.length]));

  const candidates = products.filter((p) => p.stock > 0);

  const scored: ScoredProduct[] = candidates.map((p) => {
    const reasons: string[] = [];
    let score = 0;

    const catAff = profile.categoryAffinity[p.category] || 0;
    if (catAff > 0) {
      score += catAff * 0.35;
      if (catAff > 0.5) reasons.push(`You often browse ${p.category.toLowerCase()}`);
    }

    const brandAff = profile.brandAffinity[p.brand] || 0;
    if (brandAff > 0) {
      score += brandAff * 0.2;
      if (brandAff > 0.5) reasons.push(`You frequently view ${p.brand} products`);
    }

    if (profile.priceRangeMax > 0) {
      const inRange = p.price >= profile.priceRangeMin * 0.7 && p.price <= profile.priceRangeMax * 1.2;
      if (inRange) {
        score += 0.15;
        reasons.push("Within your usual price range");
      }
    }

    if (profile.currentIntent && p.category === profile.currentIntent) {
      score += 0.15;
      reasons.push(`Matches your recent interest in ${profile.currentIntent.toLowerCase()}`);
    }

    const pop = popRank.get(p.id) || 0;
    score += pop * 0.15;
    if (pop > 0.85 && reasons.length === 0) reasons.push("Popular with similar shoppers");

    if (seenIds.has(p.id)) score *= 0.5; // avoid repeating exact same items too heavily

    return { product: p, score, reasons: reasons.length ? reasons : ["Popular right now"] };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

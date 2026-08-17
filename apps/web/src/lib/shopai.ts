import { products } from "./data";
import { parseQuery, searchProducts } from "./search";
import type { CustomerProfile } from "./types";
import type { Product } from "./types";

export type AssistantTurn = {
  role: "user" | "assistant";
  text: string;
  products?: Product[];
};

/**
 * ShopAI is a deterministic, rule-based assistant: it parses the request, searches the
 * real catalog, ranks with the same logic as search/recommendations, and explains its
 * picks. It never invents products, prices, or specs — everything it shows comes from
 * the product catalog passed in at query time.
 */
export function respond(
  message: string,
  history: AssistantTurn[],
  profile: CustomerProfile
): AssistantTurn {
  const q = message.toLowerCase().trim();
  const lastAssistantWithProducts = [...history].reverse().find((t) => t.role === "assistant" && t.products?.length);
  const shown = lastAssistantWithProducts?.products || [];

  // Follow-up: "why did you recommend this" / "why this"
  if (/why (did you|do you) recommend|why this|why am i seeing/.test(q)) {
    if (shown.length === 0) return { role: "assistant", text: "Ask me for something first and I'll explain my picks as I show them." };
    const p = shown[0];
    const reasons: string[] = [];
    if (profile.categoryAffinity[p.category] > 0.3) reasons.push(`you've shown interest in ${p.category.toLowerCase()}`);
    if (profile.brandAffinity[p.brand] > 0.3) reasons.push(`you tend to look at ${p.brand} products`);
    reasons.push(`it's rated ${p.rating}★ from ${p.reviewCount} reviews`);
    reasons.push(`it's priced at ₹${p.price.toLocaleString("en-IN")}, in a typical range for this category`);
    return {
      role: "assistant",
      text: `I recommended ${p.name} because ${reasons.join(", ")}.`,
    };
  }

  // Follow-up: cheaper options
  if (/cheaper|lower price|less expensive|budget option/.test(q)) {
    if (shown.length === 0) return { role: "assistant", text: "Show me a product first, then I can find cheaper alternatives." };
    const ref = shown[0];
    const cheaper = products
      .filter((p) => p.category === ref.category && p.price < ref.price && p.stock > 0)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 4);
    if (cheaper.length === 0) {
      return { role: "assistant", text: `${ref.name} is already one of the more affordable options I have in ${ref.category.toLowerCase()}.` };
    }
    return {
      role: "assistant",
      text: `Here are some cheaper options in ${ref.category.toLowerCase()}:`,
      products: cheaper,
    };
  }

  // Follow-up: "which is better" / "which one is better"
  if (/which (one )?is better|which should i (buy|pick|choose)/.test(q)) {
    if (shown.length < 2) return { role: "assistant", text: "Show me at least two products first — ask me to compare specific items." };
    const [a, b] = shown;
    const winner = a.rating === b.rating ? (a.reviewCount >= b.reviewCount ? a : b) : a.rating > b.rating ? a : b;
    return {
      role: "assistant",
      text: `Between ${a.name} and ${b.name}, I'd lean toward ${winner.name} — it has a ${winner.rating}★ rating from ${winner.reviewCount} reviews, which is the strongest signal I have.`,
      products: [winner],
    };
  }

  // Follow-up: compare these two
  if (/compare (these|them)|compare it/.test(q)) {
    if (shown.length < 2) return { role: "assistant", text: "I need at least two products in view to compare — ask me a search first." };
    return {
      role: "assistant",
      text: `Comparing ${shown
        .slice(0, 3)
        .map((p) => p.name)
        .join(" vs ")}: see the specs below, or open /compare for a full side-by-side.`,
      products: shown.slice(0, 3),
    };
  }

  // Follow-up: better battery / better camera / better X
  const specFollowup = q.match(/better (battery|camera|display|processor|graphics)/);
  if (specFollowup && shown.length >= 2) {
    const key = specFollowup[1];
    const keyMap: Record<string, string> = {
      battery: "Battery Life",
      camera: "Camera",
      display: "Display",
      processor: "Processor",
      graphics: "Graphics",
    };
    const specKey = keyMap[key];
    const withSpec = shown.filter((p) => p.specs[specKey]);
    if (withSpec.length >= 1) {
      return {
        role: "assistant",
        text: withSpec.map((p) => `${p.name}: ${p.specs[specKey]}`).join("\n"),
        products: withSpec,
      };
    }
  }

  // Follow-up: something similar
  if (/similar|like this one|something like/.test(q)) {
    if (shown.length === 0) return { role: "assistant", text: "Show me a product first and I'll find similar ones." };
    const ref = shown[0];
    const similar = products
      .filter((p) => p.id !== ref.id && p.category === ref.category)
      .sort((a, b) => Math.abs(a.price - ref.price) - Math.abs(b.price - ref.price))
      .slice(0, 4);
    return { role: "assistant", text: `Similar to ${ref.name}:`, products: similar };
  }

  // Default: treat as a new product search using the same query understanding as Smart Search
  const parsed = parseQuery(message);
  const results = searchProducts(message, 8);

  if (results.length === 0) {
    return {
      role: "assistant",
      text: "I couldn't find a close match in the catalog. Try mentioning a category, a budget, or what you'll use it for — for example \"a laptop for coding under 80000\".",
    };
  }

  const parts: string[] = [];
  if (parsed.category) parts.push(parsed.category.toLowerCase());
  if (parsed.useCase) parts.push(`for ${parsed.useCase}`);
  if (parsed.maxPrice) parts.push(`under ₹${parsed.maxPrice.toLocaleString("en-IN")}`);
  const summary = parts.length ? `Looking for ${parts.join(" ")} — ` : "";

  return {
    role: "assistant",
    text: `${summary}here's what matches best from the catalog, ranked by fit and rating:`,
    products: results,
  };
}

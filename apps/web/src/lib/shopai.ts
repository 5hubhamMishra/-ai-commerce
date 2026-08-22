import { products, categories } from "./data";
import { parseQuery, searchProducts } from "./search";
import { formatPrice } from "./format";
import type { CustomerProfile } from "./types";
import type { Product } from "./types";

export type AssistantTurn = {
  role: "user" | "assistant";
  text: string;
  products?: Product[];
};

const STOPWORDS = new Set([
  "the", "a", "an", "for", "of", "with", "and", "or", "is", "it", "this", "that",
  "does", "do", "what", "whats", "how", "much", "many", "on", "in", "to", "me",
  "tell", "about", "your",
]);

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Resolves which real catalog product a message is actually about, so a follow-up
 * question can be answered directly ("what's the battery life on the Sony WH-1000XM5")
 * without the user having to have that exact product already on screen. Scored by
 * significant-word overlap against "<brand> <name>" — requires at least two matching
 * words (or an exact brand + category match) to avoid a false positive on a generic word.
 */
function findProductByName(message: string): Product | undefined {
  const queryWords = new Set(significantWords(message));
  if (queryWords.size === 0) return undefined;

  let best: { product: Product; score: number } | undefined;
  for (const p of products) {
    // A product's own name usually already repeats its brand (e.g. "Amul" the brand,
    // "Amul Peanut Butter Everyday" the name) — de-duplicate with a Set, or a query that
    // only mentions the brand once double-counts that single match and crosses the
    // "confidently identified" threshold on brand alone.
    const nameWords = new Set(significantWords(`${p.brand} ${p.name}`));
    let score = 0;
    for (const w of nameWords) {
      if (queryWords.has(w)) score++;
    }
    if (!best || score > best.score) best = { product: p, score };
  }
  return best && best.score >= 2 ? best.product : undefined;
}

/** Matches a spec key mentioned in the query against a product's real spec keys —
 *  case/spacing-insensitive, and tolerant of a partial mention ("battery" matches
 *  "Battery Life", "size" matches "Available Sizes"). */
function findMatchingSpecKey(product: Product, query: string): string | undefined {
  const q = query.toLowerCase();
  const keys = Object.keys(product.specs);
  // Prefer the longest matching key first so "battery life" beats a bare "battery".
  const sorted = [...keys].sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    const keyWords = key.toLowerCase().split(/\s+/);
    if (keyWords.some((w) => w.length > 2 && q.includes(w))) return key;
  }
  return undefined;
}

const AFFIRMATIVE_KEYWORDS = /\b(does it have|does .*have|is it|has it got|comes with)\b/;
const SPEC_QUESTION_KEYWORDS = /\b(what('?s| is)|how (much|many)|which)\b/;
const PRICE_KEYWORDS = /\b(price|cost|how much)\b/;
const STOCK_KEYWORDS = /\b(in stock|available|how many (left|are there)|sold out)\b/;

/** Answers a direct question about one specific, already-identified product — the core
 *  fix for "just lists items instead of answering the question." `explicitlyNamed`
 *  distinguishes a product the user actually named in this message from one merely
 *  inferred from what was last shown — a generic "tell me ..." should only trigger a
 *  full product summary in the first case; in the second, an unrelated general question
 *  ("tell me the types of items on the site") must not get misread as being about
 *  whatever happened to be on screen. */
function answerAboutProduct(
  product: Product,
  message: string,
  explicitlyNamed: boolean
): AssistantTurn | undefined {
  const q = message.toLowerCase();

  if (PRICE_KEYWORDS.test(q)) {
    const discountNote =
      product.compareAtPrice && product.compareAtPrice > product.price
        ? ` (down from ${formatPrice(product.compareAtPrice)})`
        : "";
    return {
      role: "assistant",
      text: `The ${product.name} is priced at ${formatPrice(product.price)}${discountNote}.`,
      products: [product],
    };
  }

  if (STOCK_KEYWORDS.test(q)) {
    const text =
      product.stock === 0
        ? `The ${product.name} is currently out of stock.`
        : product.stock < 10
          ? `Only ${product.stock} left of the ${product.name} — it's running low.`
          : `Yes, the ${product.name} is in stock (${product.stock} available).`;
    return { role: "assistant", text, products: [product] };
  }

  const specKey = findMatchingSpecKey(product, q);
  if (specKey && (SPEC_QUESTION_KEYWORDS.test(q) || AFFIRMATIVE_KEYWORDS.test(q))) {
    const value = product.specs[specKey];
    if (AFFIRMATIVE_KEYWORDS.test(q)) {
      return {
        role: "assistant",
        text: `Yes — the ${product.name}'s ${specKey.toLowerCase()} is ${value}.`,
        products: [product],
      };
    }
    return {
      role: "assistant",
      text: `${specKey} on the ${product.name}: ${value}.`,
      products: [product],
    };
  }

  // A yes/no question about a feature not in the spec sheet at all — answer honestly
  // rather than guessing or silently falling through to an unrelated product search.
  if (AFFIRMATIVE_KEYWORDS.test(q)) {
    return {
      role: "assistant",
      text: `I don't have that specific detail listed for the ${product.name} — here's everything I do have on it:`,
      products: [product],
    };
  }

  // The product was clearly identified and the question is asking about *it* specifically
  // (e.g. "tell me more", "describe this one", or the user just named it: "tell me about
  // the Nike Air Max") — give a real, synthesized summary instead of nothing. When the
  // product was only *inferred* from what was last shown (not named in this message),
  // require the question to explicitly say "it"/"this" — a bare "tell me ..." used to
  // match *any* message containing those two words, including a general question with
  // nothing to do with that product ("tell me the types of items on the site"), and
  // silently answered about whatever happened to be on screen instead.
  const referringToIt = /(tell me (more|about (it|this)|everything)|describe (it|this)|more details|full details)/.test(q);
  const namingItDirectly = explicitlyNamed && /tell me|describe|details|summary/.test(q);
  if (referringToIt || namingItDirectly) {
    const topSpecs = Object.entries(product.specs)
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    return {
      role: "assistant",
      text: `${product.name} — ${formatPrice(product.price)}, rated ${product.rating}★ from ${product.reviewCount} reviews. ${topSpecs}.`,
      products: [product],
    };
  }

  return undefined;
}

// Catalog-overview questions ("what types of items do you have", "what do you sell",
// "what categories are there") — a real, previously-missing capability. Checked ahead of
// any product-specific question pattern, since it's phrased like a normal question but
// isn't about any single product — routing it through answerAboutProduct() misread it as
// being about whatever product happened to be on screen.
const CATALOG_OVERVIEW_KEYWORDS =
  /\b((types?|kinds?|categories) of (items?|products?|things?)|what (do you|does the site) sell|what('s| is) (on|available on|listed on) (the site|this site|here)|what can i buy|(which|what) categories)\b/;

/**
 * The fixed phrasing list above is too rigid — real users don't ask in exactly those
 * words ("what are the things that are listed on the shop" doesn't match any of them).
 * This is a second, token-combination pass: a question/list-request word ("what",
 * "which", "show me", "list") plus either a whole-catalog word ("everything", "things",
 * "items", "products", "stuff", "categories") or a sell/have/carry verb paired with a
 * store-referring word ("shop", "store", "site", "catalog", "website", "here"). Requiring
 * the question-word keeps this from swallowing statements ("recommend a formal shirt"),
 * and requiring the whole-catalog/verb+store combination keeps it from swallowing a
 * per-product question ("what is the shelf life", "is it available") — those don't
 * contain any of these generic words at all.
 */
function isCatalogOverviewQuestion(q: string): boolean {
  if (CATALOG_OVERVIEW_KEYWORDS.test(q)) return true;

  const isQuestionShaped = /\b(what|which|show( me)?|list)\b/.test(q);
  if (!isQuestionShaped) return false;

  const asksForEverything =
    /\b(everything|all (the )?(things|items|products|stuff)|things|products|items|stuff|categories)\b/.test(q);
  if (asksForEverything) return true;

  const sellOrHaveVerb = /\b(sell|have|carry|stock|offer)\b/.test(q);
  const asksAboutStore = /\b(shop|store|site|catalog|website|here)\b/.test(q);
  return sellOrHaveVerb && asksAboutStore;
}

function catalogOverviewAnswer(): AssistantTurn {
  const names = categories.map((c) => c.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}` : names[0];
  return {
    role: "assistant",
    text: `We carry ${list}. Tell me a category, a budget, or what you'll use it for and I'll find something — for example "running shoes under 10000" or "a laptop for coding under 80000".`,
  };
}

const FAQ_ANSWERS: { pattern: RegExp; text: string }[] = [
  {
    pattern: /\b(shipping|delivery)\b/,
    text: "Shipping is free on orders over ₹5,000; below that there's a flat ₹149 shipping fee. You can see the exact breakdown at checkout once items are in your cart.",
  },
  {
    pattern: /\b(return|refund|exchange)\b/,
    text: "This is a demo storefront, so no real orders or returns are processed here — but a real Veloura order supports returns through the Orders page once it's been delivered.",
  },
  {
    pattern: /\b(payment|pay|checkout)\b/,
    text: "Checkout here is simulated for the demo — no real payment is charged. You just add items to your cart, enter a shipping address, and place the order to see the full flow.",
  },
];

export function respond(
  message: string,
  history: AssistantTurn[],
  profile: CustomerProfile
): AssistantTurn {
  const q = message.toLowerCase().trim();
  const lastAssistantWithProducts = [...history].reverse().find((t) => t.role === "assistant" && t.products?.length);
  const shown = lastAssistantWithProducts?.products || [];

  // A general question about the catalog itself, not any one product — check this first,
  // since it's phrased like a normal question and would otherwise get misread as being
  // about whatever product happens to be on screen.
  if (isCatalogOverviewQuestion(q)) return catalogOverviewAnswer();

  // Resolve a specific product the question is actually about — by name mention first,
  // falling back to the top-ranked product from whatever was shown last (the one ShopAI
  // itself just recommended, so "it" in a follow-up naturally means that one). Safe even
  // after a multi-result search: answerAboutProduct() only actually answers when the
  // message matches a real question pattern (price/stock/spec/yes-no) — a genuine new
  // search query just falls through to the search branch below untouched.
  const namedProduct = findProductByName(message);
  const referredProduct = namedProduct ?? shown[0];
  if (referredProduct) {
    const direct = answerAboutProduct(referredProduct, message, Boolean(namedProduct));
    if (direct) return direct;
  }

  // Follow-up: "why did you recommend this" / "why this"
  if (/why (did you|do you) recommend|why this|why am i seeing/.test(q)) {
    if (shown.length === 0) return { role: "assistant", text: "Ask me for something first and I'll explain my picks as I show them." };
    const p = shown[0];
    const reasons: string[] = [];
    if (profile.categoryAffinity[p.category] > 0.3) reasons.push(`you've shown interest in ${p.category.toLowerCase()}`);
    if (profile.brandAffinity[p.brand] > 0.3) reasons.push(`you tend to look at ${p.brand} products`);
    reasons.push(`it's rated ${p.rating}★ from ${p.reviewCount} reviews`);
    reasons.push(`it's priced at ${formatPrice(p.price)}, in a typical range for this category`);
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

  // Follow-up: better battery / better camera / better X — generalized to any real spec
  // key in the catalog, not a fixed shortlist, so this now works for clothing/footwear/
  // grocery attributes too ("better fabric", "better sole", "better shelf life").
  const betterMatch = q.match(/better ([\w\s]+?)(\?|$|\.)/);
  if (betterMatch && shown.length >= 2) {
    const specKey = shown
      .flatMap((p) => Object.keys(p.specs))
      .find((k) => k.toLowerCase().includes(betterMatch[1].trim()) || betterMatch[1].trim().includes(k.toLowerCase().split(" ")[0]));
    if (specKey) {
      const withSpec = shown.filter((p) => p.specs[specKey]);
      if (withSpec.length >= 1) {
        return {
          role: "assistant",
          text: withSpec.map((p) => `${p.name}: ${p.specs[specKey]}`).join("\n"),
          products: withSpec,
        };
      }
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

  // Store/policy questions (shipping, returns, payment) — answered directly rather than
  // falling through to an unrelated product search that would return nothing useful.
  const faq = FAQ_ANSWERS.find((f) => f.pattern.test(q));
  if (faq) return { role: "assistant", text: faq.text };

  // Default: treat as a new product search using the same query understanding as Smart
  // Search, but actually answer with a real recommendation instead of just a list.
  const parsed = parseQuery(message);
  const results = searchProducts(message, 8);

  if (results.length === 0) {
    return {
      role: "assistant",
      text: "I couldn't find a close match in the catalog. Try mentioning a category, a budget, or what you'll use it for — for example \"a laptop for coding under 80000\" or \"a formal shirt under 2000\".",
    };
  }

  const parts: string[] = [];
  if (parsed.category) parts.push(parsed.category.toLowerCase());
  if (parsed.useCase) parts.push(`for ${parsed.useCase}`);
  if (parsed.maxPrice) parts.push(`under ${formatPrice(parsed.maxPrice)}`);
  const scopeText = parts.length ? `for ${parts.join(" ")}` : "";

  const top = results[0];
  const why =
    top.rating >= 4.5
      ? `it's one of the highest-rated options I have${scopeText ? ` ${scopeText}` : ""} (${top.rating}★, ${top.reviewCount} reviews)`
      : parsed.maxPrice !== undefined
        ? `it fits your budget and has the strongest rating among matches (${top.rating}★)`
        : `it's the best overall match ${scopeText || "for what you asked"} (${top.rating}★, ${top.reviewCount} reviews)`;

  return {
    role: "assistant",
    text: `I'd go with the ${top.name} — ${why}, at ${formatPrice(top.price)}. Here's how it compares against the rest of what matched:`,
    products: results,
  };
}

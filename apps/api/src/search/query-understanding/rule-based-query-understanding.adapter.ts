import { Injectable } from '@nestjs/common';
import type {
  QueryUnderstandingContext,
  QueryUnderstandingProvider,
  QueryUnderstandingResult,
} from './query-understanding.interface';

// Matches "under ₹5000", "below $200", "less than 3,000", "max 5000" etc.
const MAX_PRICE_PATTERN =
  /\b(?:under|below|less\s+than|max(?:imum)?(?:\s+of)?)\s*[₹$]?\s*([\d][\d,]*)\b/i;
// Matches "over ₹5000", "above $200", "more than 3000", "min 5000" etc.
const MIN_PRICE_PATTERN =
  /\b(?:over|above|more\s+than|min(?:imum)?(?:\s+of)?)\s*[₹$]?\s*([\d][\d,]*)\b/i;

/** A controlled vocabulary of use-case/attribute keywords — the spec's own
 *  example ("wireless/lightweight/sweat-resistant" for "gym"). Soft signals
 *  only; SearchService uses these as a relevance boost, not a filter, since
 *  most products don't have every applicable attribute as a literal tag. */
const ATTRIBUTE_VOCABULARY = [
  'wireless',
  'bluetooth',
  'lightweight',
  'sweat-resistant',
  'sweatproof',
  'waterproof',
  'water-resistant',
  'noise-cancelling',
  'noise-canceling',
  'fast-charging',
  'portable',
  'foldable',
  'compact',
  'gaming',
  'gym',
  'travel',
  'outdoor',
  'office',
  'budget',
  'premium',
];

/** Use-case → implied product attributes — a small, authored mapping so a
 *  use-case keyword expands to the spec's own worked example
 *  ("gym" implying wireless/lightweight/sweat-resistant) without needing an
 *  LLM to infer it. Real domain knowledge, not fabricated: these are the
 *  same attribute strings ATTRIBUTE_VOCABULARY already recognizes literally,
 *  just pre-associated with the use-cases that usually want them. */
const USE_CASE_IMPLICATIONS: Record<string, string[]> = {
  gym: ['wireless', 'lightweight', 'sweat-resistant'],
  travel: ['portable', 'compact', 'lightweight'],
  office: ['noise-cancelling', 'wireless'],
  outdoor: ['waterproof', 'portable'],
};

/** Synonym → a real category *name* (lowercased), so a query using a common
 *  word finds the actual catalog category without the caller needing to
 *  know its exact name/slug. Kept intentionally small and tied to this
 *  catalog's real 8 categories (Laptops/Headphones/Smartphones/Gaming/
 *  Wearables/Cameras/Home Audio/Accessories — see recommendations
 *  module's COMPLEMENTARY_CATEGORIES for the same list used elsewhere). */
const CATEGORY_SYNONYMS: Record<string, string> = {
  earbuds: 'headphones',
  earphones: 'headphones',
  headset: 'headphones',
  phone: 'smartphones',
  phones: 'smartphones',
  mobile: 'smartphones',
  notebook: 'laptops',
  notebooks: 'laptops',
  laptop: 'laptops',
  smartwatch: 'wearables',
  smartwatches: 'wearables',
  watch: 'wearables',
  band: 'wearables',
  tracker: 'wearables',
  camera: 'cameras',
  dslr: 'cameras',
  speaker: 'home audio',
  speakers: 'home audio',
  soundbar: 'home audio',
  console: 'gaming',
  controller: 'gaming',
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsWholeWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'i').test(haystack);
}

function matchCategory(
  lowerQuery: string,
  tokens: string[],
  categories: { slug: string; name: string }[],
): string | null {
  // Direct name match first — handles multi-word names like "Home Audio".
  for (const c of categories) {
    if (containsWholeWord(lowerQuery, c.name.toLowerCase())) return c.slug;
  }
  // Fall back to the synonym map, one token at a time.
  for (const token of tokens) {
    const resolved = CATEGORY_SYNONYMS[token];
    if (!resolved) continue;
    const hit = categories.find((c) => c.name.toLowerCase() === resolved);
    if (hit) return hit.slug;
  }
  return null;
}

function matchBrand(
  lowerQuery: string,
  brands: { slug: string; name: string }[],
): string | null {
  for (const b of brands) {
    if (containsWholeWord(lowerQuery, b.name.toLowerCase())) return b.slug;
  }
  return null;
}

/**
 * Deterministic, regex/keyword-based query understanding — no external call,
 * nothing to be "unavailable." Extracts the spec's own worked example
 * ("good headphones for gym under ₹5000" → category=headphones,
 * use_case=gym, max_price=5000, possible_attributes=[...]) without an LLM.
 * See the interface doc comment for why this is the primary implementation,
 * not a fallback.
 */
@Injectable()
export class RuleBasedQueryUnderstandingAdapter implements QueryUnderstandingProvider {
  parse(
    query: string,
    context: QueryUnderstandingContext,
  ): QueryUnderstandingResult {
    let cleaned = query;
    let maxPrice: number | null = null;
    let minPrice: number | null = null;

    const maxMatch = MAX_PRICE_PATTERN.exec(query);
    if (maxMatch) {
      maxPrice = Number(maxMatch[1].replace(/,/g, ''));
      cleaned = cleaned.replace(maxMatch[0], ' ');
    }
    const minMatch = MIN_PRICE_PATTERN.exec(query);
    if (minMatch) {
      minPrice = Number(minMatch[1].replace(/,/g, ''));
      cleaned = cleaned.replace(minMatch[0], ' ');
    }

    const lowerQuery = query.toLowerCase();
    const tokens = lowerQuery.split(/[^a-z0-9]+/).filter(Boolean);

    const literalAttributes = ATTRIBUTE_VOCABULARY.filter((attr) =>
      lowerQuery.includes(attr),
    );
    const impliedAttributes = literalAttributes.flatMap(
      (attr) => USE_CASE_IMPLICATIONS[attr] ?? [],
    );

    return {
      cleanedQuery: cleaned.replace(/\s+/g, ' ').trim(),
      category: matchCategory(lowerQuery, tokens, context.categories),
      brand: matchBrand(lowerQuery, context.brands),
      minPrice,
      maxPrice,
      attributes: [...new Set([...literalAttributes, ...impliedAttributes])],
    };
  }
}

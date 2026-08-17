import { products, categories } from "./data";
import type { Product } from "./types";

export type ParsedQuery = {
  category?: string;
  maxPrice?: number;
  minPrice?: number;
  useCase?: string;
  brand?: string;
  keywords: string[];
};

const useCaseWords = [
  "gym",
  "travel",
  "commute",
  "gaming",
  "work calls",
  "studio",
  "coding",
  "machine learning",
  "student",
  "business",
  "video editing",
  "photography",
  "everyday use",
  "fitness tracking",
  "running",
  "swimming",
  "vlogging",
  "professional photography",
  "wildlife",
  "home theater",
  "party",
];

/** Lightweight query-understanding: extracts category, budget, use case and brand from free text. */
export function parseQuery(raw: string): ParsedQuery {
  const q = raw.toLowerCase();
  const result: ParsedQuery = { keywords: [] };

  // Budget: "under 5000", "below ₹5000", "under 5k", "<5000"
  const underMatch = q.match(/(?:under|below|less than|<)\s*₹?\s*(\d+(?:[.,]\d+)?)(k)?/);
  if (underMatch) {
    const val = parseFloat(underMatch[1].replace(",", ""));
    result.maxPrice = underMatch[2] ? val * 1000 : val;
  }
  const overMatch = q.match(/(?:over|above|more than|>)\s*₹?\s*(\d+(?:[.,]\d+)?)(k)?/);
  if (overMatch) {
    const val = parseFloat(overMatch[1].replace(",", ""));
    result.minPrice = overMatch[2] ? val * 1000 : val;
  }
  const rangeMatch = q.match(/₹?\s*(\d+)(k)?\s*(?:-|to)\s*₹?\s*(\d+)(k)?/);
  if (rangeMatch) {
    const mult1 = rangeMatch[2] ? 1000 : 1;
    const mult2 = rangeMatch[4] ? 1000 : 1;
    result.minPrice = parseFloat(rangeMatch[1]) * mult1;
    result.maxPrice = parseFloat(rangeMatch[3]) * mult2;
  }

  for (const cat of categories) {
    const singular = cat.name.toLowerCase().replace(/s$/, "");
    if (q.includes(cat.name.toLowerCase()) || q.includes(singular)) {
      result.category = cat.name;
      break;
    }
    for (const brand of cat.brands) {
      if (q.includes(brand.toLowerCase())) {
        result.brand = brand;
        result.category = result.category || cat.name;
      }
    }
  }

  // category aliases
  const aliases: Record<string, string> = {
    laptop: "Laptops",
    notebook: "Laptops",
    headphone: "Headphones",
    earbud: "Headphones",
    phone: "Smartphones",
    mobile: "Smartphones",
    smartwatch: "Wearables",
    watch: "Wearables",
    camera: "Cameras",
    speaker: "Home Audio",
    mouse: "Gaming",
    keyboard: "Gaming",
  };
  if (!result.category) {
    for (const [alias, cat] of Object.entries(aliases)) {
      if (q.includes(alias)) {
        result.category = cat;
        break;
      }
    }
  }

  for (const uc of useCaseWords) {
    if (q.includes(uc)) {
      result.useCase = uc;
      break;
    }
  }

  result.keywords = q
    .replace(/[^\w\s₹]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["under", "below", "over", "above", "for", "the", "with", "and"].includes(w));

  return result;
}

export function searchProducts(raw: string, limit = 24): Product[] {
  if (!raw.trim()) return [];
  const parsed = parseQuery(raw);

  const scored = products.map((p) => {
    let score = 0;
    const haystack = `${p.name} ${p.brand} ${p.category} ${p.description} ${p.tags.join(" ")}`.toLowerCase();

    for (const kw of parsed.keywords) {
      if (haystack.includes(kw)) score += 2;
    }
    if (parsed.category && p.category === parsed.category) score += 6;
    if (parsed.brand && p.brand === parsed.brand) score += 5;
    if (parsed.useCase && p.useCases?.some((u) => u.includes(parsed.useCase!))) score += 5;
    if (parsed.maxPrice !== undefined) {
      if (p.price <= parsed.maxPrice) score += 3;
      else score -= 4;
    }
    if (parsed.minPrice !== undefined) {
      if (p.price >= parsed.minPrice) score += 1;
      else score -= 4;
    }
    score += p.rating * 0.3;
    return { p, score };
  });

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.p);
}

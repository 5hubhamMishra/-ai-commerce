import productsRaw from "./data/products.json";
import reviewsRaw from "./data/reviews.json";
import categoriesRaw from "./data/categories.json";
import type { Product, Review } from "./types";

export const products = productsRaw as unknown as Product[];
export const reviews = reviewsRaw as Review[];
export const categories = categoriesRaw as { name: string; slug: string; brands: string[] }[];

const productById = new Map(products.map((p) => [p.id, p]));

export function getProduct(id: string): Product | undefined {
  return productById.get(id);
}

export function getReviewsFor(productId: string): Review[] {
  return reviews.filter((r) => r.productId === productId);
}

export function getCategory(slug: string) {
  return categories.find((c) => c.slug === slug);
}

export function productsInCategory(slug: string): Product[] {
  return products.filter((p) => p.subcategory === slug);
}

export function popularProducts(limit = 12): Product[] {
  return [...products]
    .sort((a, b) => b.rating * Math.log(b.reviewCount + 1) - a.rating * Math.log(a.reviewCount + 1))
    .slice(0, limit);
}

export function dealsProducts(limit = 12): Product[] {
  return products
    .filter((p) => p.compareAtPrice && p.compareAtPrice > p.price)
    .sort((a, b) => {
      const discA = 1 - a.price / (a.compareAtPrice || a.price);
      const discB = 1 - b.price / (b.compareAtPrice || b.price);
      return discB - discA;
    })
    .slice(0, limit);
}

export function discountPercent(p: Product): number {
  if (!p.compareAtPrice || p.compareAtPrice <= p.price) return 0;
  return Math.round((1 - p.price / p.compareAtPrice) * 100);
}

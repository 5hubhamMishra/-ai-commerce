import productsRaw from "./data/products.json";
import type { Product } from "./types";

// The only remaining consumer is store.ts's legacy, intentionally-untouched local
// cart/wishlist/orders/events slice (placeOrder()'s price lookup) — every real-catalog
// page now reads from apps/api via @ai-commerce/api-client instead. Kept minimal on
// purpose; do not add new features against this static data.
export const products = productsRaw as unknown as Product[];

const productById = new Map(products.map((p) => [p.id, p]));

export function getProduct(id: string): Product | undefined {
  return productById.get(id);
}

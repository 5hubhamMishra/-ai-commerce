export type CartItemAttribute = {
  attribute: string;
  value: string;
};

/** Matches `toCartResponse()`'s per-item mapping in apps/api/src/cart/cart.service.ts. */
export type CartItemResponse = {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;
  currency: string;
  quantity: number;
  lineTotal: number;
  availableQuantity: number;
  isAvailable: boolean;
  insufficientStock: boolean;
  attributes: CartItemAttribute[];
};

/** Matches `toCartResponse()` in apps/api/src/cart/cart.service.ts — the shape every
 *  cart endpoint (GET/POST/PATCH/DELETE) returns. */
export type CartResponse = {
  id: string;
  items: CartItemResponse[];
  itemCount: number;
  subtotal: number;
  currency: string;
  hasUnavailableItems: boolean;
};

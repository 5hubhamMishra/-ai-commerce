import type { ProductStatus } from './catalog';

/** Matches `list()`'s per-item mapping in apps/api/src/wishlist/wishlist.service.ts. */
export type WishlistItemResponse = {
  productId: string;
  slug: string;
  name: string;
  brand: string | null;
  status: ProductStatus;
  imageUrl: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  isAvailable: boolean;
  addedAt: string;
};

export type WishlistResponse = {
  items: WishlistItemResponse[];
};

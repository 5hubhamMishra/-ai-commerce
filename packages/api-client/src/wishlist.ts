import type { WishlistResponse } from '@ai-commerce/types';
import { request } from './http';

export const wishlistApi = {
  list: () => request<WishlistResponse>('/wishlist'),

  /** Idempotent server-side — adding an already-wishlisted product is a no-op success. */
  add: (productId: string) =>
    request<WishlistResponse>('/wishlist/items', {
      method: 'POST',
      body: { productId },
    }),

  remove: (productId: string) =>
    request<WishlistResponse>(`/wishlist/items/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
    }),
};

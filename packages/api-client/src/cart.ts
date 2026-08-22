import type { CartResponse } from '@ai-commerce/types';
import { request } from './http';

export const cartApi = {
  getCart: () => request<CartResponse>('/cart'),

  addItem: (variantId: string, quantity: number) =>
    request<CartResponse>('/cart/items', {
      method: 'POST',
      body: { variantId, quantity },
    }),

  /** quantity <= 0 removes the line (mirrors apps/api's own UpdateCartItemDto semantics). */
  updateItem: (itemId: string, quantity: number) =>
    request<CartResponse>(`/cart/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      body: { quantity },
    }),

  removeItem: (itemId: string) =>
    request<CartResponse>(`/cart/items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
    }),

  clear: () => request<void>('/cart', { method: 'DELETE' }),
};

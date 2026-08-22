import type { CreateOrderInput, ListOrdersQuery, ListOrdersResponse, OrderDetail } from '@ai-commerce/types';
import { request, toQueryString } from './http';

export const ordersApi = {
  /** Requires a fresh Idempotency-Key per checkout attempt so a network retry or a
   *  double-click can't create two orders — apps/api replays the first response instead. */
  create: (input: CreateOrderInput) =>
    request<OrderDetail>('/orders', {
      method: 'POST',
      body: input,
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    }),

  list: (query: ListOrdersQuery = {}) =>
    request<ListOrdersResponse>(`/orders${toQueryString(query)}`),

  get: (id: string) => request<OrderDetail>(`/orders/${encodeURIComponent(id)}`),

  cancel: (id: string, reason?: string) =>
    request<OrderDetail>(`/orders/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: { reason },
    }),
};

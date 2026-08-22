import type {
  AddTrackingEventInput,
  CreateOrderInput,
  ListOrdersQuery,
  ListOrdersResponse,
  OrderDetail,
  UpdateOrderStatusInput,
} from '@ai-commerce/types';
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

  // ---- Admin (SUPPORT_AGENT/ADMIN/SUPER_ADMIN for reads, INVENTORY_MANAGER/ADMIN/
  // SUPER_ADMIN for the mutations below — not owner-restricted like the customer routes) ----

  adminList: (query: ListOrdersQuery = {}) =>
    request<ListOrdersResponse>(`/orders/admin${toQueryString(query)}`),

  adminGet: (id: string) => request<OrderDetail>(`/orders/admin/${encodeURIComponent(id)}`),

  adminUpdateStatus: (id: string, input: UpdateOrderStatusInput) =>
    request<OrderDetail>(`/orders/admin/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: input,
    }),

  adminAddTrackingEvent: (id: string, input: AddTrackingEventInput) =>
    request<OrderDetail>(`/orders/admin/${encodeURIComponent(id)}/tracking-events`, {
      method: 'POST',
      body: input,
    }),
};

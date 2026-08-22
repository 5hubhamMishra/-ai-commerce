import type { Address, CreateAddressInput, UpdateAddressInput } from '@ai-commerce/types';
import { request } from './http';

export const addressesApi = {
  list: () => request<Address[]>('/addresses'),

  create: (input: CreateAddressInput) =>
    request<Address>('/addresses', { method: 'POST', body: input }),

  update: (id: string, input: UpdateAddressInput) =>
    request<Address>(`/addresses/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),

  remove: (id: string) =>
    request<void>(`/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

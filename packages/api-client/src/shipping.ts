import type { ShippingMethodQuote } from '@ai-commerce/types';
import { request, toQueryString } from './http';

export const shippingApi = {
  quote: (addressId: string) =>
    request<ShippingMethodQuote[]>(`/shipping/quote${toQueryString({ addressId })}`),
};

import type { ConfirmPaymentResponse, CreatePaymentResponse } from '@ai-commerce/types';
import { request } from './http';

export const paymentsApi = {
  create: (orderId: string) =>
    request<CreatePaymentResponse>('/payments', {
      method: 'POST',
      body: { orderId },
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    }),

  /** `simulateFailure` only has any effect against the dev payment adapter (a real provider
   *  ignores client-supplied outcome fields entirely) — omitted here since apps/web always
   *  wants a real confirm attempt, never a forced failure. */
  confirm: (paymentId: string) =>
    request<ConfirmPaymentResponse>(`/payments/${encodeURIComponent(paymentId)}/confirm`, {
      method: 'POST',
      body: {},
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    }),
};

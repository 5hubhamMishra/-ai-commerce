import type { ConfirmPaymentResponse, CreatePaymentResponse } from '@ai-commerce/types';
import { request } from './http';

export const paymentsApi = {
  create: (orderId: string) =>
    request<CreatePaymentResponse>('/payments', {
      method: 'POST',
      body: { orderId },
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    }),

  /** `payload` carries whatever a real provider's client-side widget handed back for
   *  server-side verification (Razorpay Checkout's razorpayPaymentId/razorpaySignature) — the
   *  adapter is what actually trusts or distrusts these, never the DTO itself. Omit for the
   *  simulated dev-adapter path, which ignores client-supplied outcome fields entirely. */
  confirm: (paymentId: string, payload?: { razorpayPaymentId?: string; razorpaySignature?: string }) =>
    request<ConfirmPaymentResponse>(`/payments/${encodeURIComponent(paymentId)}/confirm`, {
      method: 'POST',
      body: payload ?? {},
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    }),
};

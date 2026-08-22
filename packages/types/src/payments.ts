import type { PaymentStatus } from "./orders";

/** Matches `PaymentsService.createPaymentInternal()`'s return shape in
 *  apps/api/src/payments/payments.service.ts. */
export type CreatePaymentResponse = {
  paymentId: string;
  orderId: string;
  providerRef: string;
  clientSecret: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
};

/** Matches `buildOutcome()`'s return shape — what both `POST /payments/:id/confirm` and a
 *  replayed-already-resolved confirm call return. */
export type ConfirmPaymentResponse = {
  paymentId: string;
  orderId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  failureReason: string | null;
};

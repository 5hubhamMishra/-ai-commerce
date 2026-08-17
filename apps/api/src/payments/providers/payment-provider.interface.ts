import type { PaymentProviderType } from '@prisma/client';

export type CreateIntentInput = {
  orderId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
};

export type CreateIntentResult = {
  providerRef: string;
  clientSecret?: string;
  raw: Record<string, unknown>;
};

export type ConfirmPaymentInput = {
  providerRef: string;
  payload?: Record<string, unknown>;
};

export type ConfirmPaymentResult = {
  success: boolean;
  raw: Record<string, unknown>;
  failureReason?: string;
};

export type RefundInput = {
  providerRef: string;
  amount: number;
  currency: string;
  reason: string;
};

export type RefundResult = {
  success: boolean;
  providerRefundRef: string;
  raw: Record<string, unknown>;
  failureReason?: string;
};

/**
 * Provider abstraction so payment gateways can be swapped without touching
 * PaymentsService (spec: "Create a provider abstraction so payment providers can
 * be replaced" — example given: PaymentProvider -> RazorpayAdapter | StripeAdapter
 * | DevelopmentPaymentAdapter). Only DevelopmentPaymentAdapter is implemented in
 * Phase 3 ("Do not integrate a real payment provider until the abstraction is
 * tested") — Razorpay/Stripe adapters are future work behind this same interface.
 */
export interface PaymentProvider {
  readonly type: PaymentProviderType;
  createIntent(input: CreateIntentInput): Promise<CreateIntentResult>;
  confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResult>;
  /** Refunds against the original payment's provider reference — never a fresh
   *  charge, and never for more than that payment's own amount (enforced by
   *  RefundsService, not the provider). */
  refund(input: RefundInput): Promise<RefundResult>;
  /** Dev adapter has no real signing secret — always returns true. A real adapter
   *  must verify against its provider's HMAC signature before trusting a webhook body. */
  verifyWebhookSignature(
    payload: string,
    signature: string | undefined,
  ): boolean;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

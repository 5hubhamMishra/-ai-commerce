export type PayoutInput = {
  sellerId: string;
  amount: number;
  currency: string;
};

export type PayoutResult = {
  success: boolean;
  providerRef?: string;
  failureReason?: string;
  raw: Record<string, unknown>;
};

/**
 * Provider abstraction for actually moving money to a seller (bank transfer,
 * Razorpay Route, Stripe Connect, etc.) — same interface-plus-injection-token-
 * plus-dev-adapter shape as PaymentProvider/ShippingProvider/
 * SellerVerificationProvider (see DECISIONS.md ADR-015/ADR-020). Only
 * DevelopmentPayoutAdapter exists this phase.
 */
export interface SellerPayoutProvider {
  payout(input: PayoutInput): Promise<PayoutResult>;
}

export const SELLER_PAYOUT_PROVIDER = Symbol('SELLER_PAYOUT_PROVIDER');

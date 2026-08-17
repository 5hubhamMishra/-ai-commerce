export type VerifyInput = {
  sellerId: string;
  businessName: string;
};

export type VerifyResult = {
  status: 'VERIFIED' | 'REJECTED' | 'PENDING_MANUAL_REVIEW';
  reason?: string;
};

/**
 * Provider abstraction so a real KYC/business-verification service can be
 * swapped in without touching SellersService — same shape as Phase 3's
 * PaymentProvider/ShippingProvider (interface + injection token + dev adapter
 * only; see DECISIONS.md ADR-015, extended by ADR-020 for Phase 5). An admin
 * can always override the provider's verdict via
 * PATCH /sellers/admin/:id/verify regardless of which adapter is active.
 */
export interface SellerVerificationProvider {
  verify(input: VerifyInput): Promise<VerifyResult>;
}

export const SELLER_VERIFICATION_PROVIDER = Symbol(
  'SELLER_VERIFICATION_PROVIDER',
);

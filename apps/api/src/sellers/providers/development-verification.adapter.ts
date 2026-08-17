import { Injectable } from '@nestjs/common';
import type {
  SellerVerificationProvider,
  VerifyInput,
  VerifyResult,
} from './seller-verification-provider.interface';

/**
 * Simulates instant KYC/business verification so the full seller-onboarding
 * flow can be built and tested without a real verification vendor. Auto-
 * approves by default; a business name containing "reject" (case-insensitive)
 * deterministically exercises the rejection path in tests, the same
 * `simulateFailure`-style testing hook DevelopmentPaymentAdapter uses.
 */
@Injectable()
export class DevelopmentVerificationAdapter implements SellerVerificationProvider {
  verify(input: VerifyInput): Promise<VerifyResult> {
    if (input.businessName.toLowerCase().includes('reject')) {
      return Promise.resolve({
        status: 'REJECTED',
        reason: 'Simulated rejection for development/testing.',
      });
    }
    return Promise.resolve({ status: 'VERIFIED' });
  }
}

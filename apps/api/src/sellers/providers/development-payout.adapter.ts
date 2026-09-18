import { randomUUID } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  PayoutInput,
  PayoutResult,
  SellerPayoutProvider,
} from './seller-payout-provider.interface';

/** Simulates a successful payout synchronously, same "dev adapter, real
 *  interface" precedent as DevelopmentPaymentAdapter. */
@Injectable()
export class DevelopmentPayoutAdapter implements SellerPayoutProvider {
  payout(input: PayoutInput): Promise<PayoutResult> {
    if (isProductionLike()) {
      return Promise.reject(
        new ServiceUnavailableException({
          code: 'PAYOUT_PROVIDER_UNAVAILABLE',
          message: 'Seller payouts require an activated external provider.',
        }),
      );
    }
    return Promise.resolve({
      success: true,
      providerRef: `dev_payout_${randomUUID()}`,
      raw: {
        simulated: true,
        sellerId: input.sellerId,
        amount: input.amount,
        currency: input.currency,
      },
    });
  }
}

function isProductionLike() {
  return (
    process.env.NODE_ENV?.trim() === 'production' ||
    process.env.VERCEL_ENV?.trim() === 'production'
  );
}

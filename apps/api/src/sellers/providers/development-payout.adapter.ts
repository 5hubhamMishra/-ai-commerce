import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
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

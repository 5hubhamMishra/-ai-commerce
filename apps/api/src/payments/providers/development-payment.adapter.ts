import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PaymentProviderType } from '@prisma/client';
import type {
  ConfirmPaymentInput,
  ConfirmPaymentResult,
  CreateIntentInput,
  CreateIntentResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
} from './payment-provider.interface';

/**
 * Simulates a payment gateway synchronously so the full order/payment/inventory
 * flow can be built and tested end to end without a real Razorpay/Stripe account.
 * `payload.simulateFailure: true` lets tests deterministically exercise the
 * failure path (payment declined) alongside the happy path.
 */
@Injectable()
export class DevelopmentPaymentAdapter implements PaymentProvider {
  readonly type = PaymentProviderType.DEVELOPMENT;

  createIntent(input: CreateIntentInput): Promise<CreateIntentResult> {
    return Promise.resolve({
      providerRef: `dev_${randomUUID()}`,
      clientSecret: `dev_secret_${randomUUID()}`,
      raw: { simulated: true, orderId: input.orderId, amount: input.amount },
    });
  }

  confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResult> {
    if (input.payload?.simulateFailure === true) {
      return Promise.resolve({
        success: false,
        raw: { simulated: true, providerRef: input.providerRef },
        failureReason: 'Simulated payment decline for development/testing.',
      });
    }
    return Promise.resolve({
      success: true,
      raw: { simulated: true, providerRef: input.providerRef },
    });
  }

  refund(input: RefundInput): Promise<RefundResult> {
    return Promise.resolve({
      success: true,
      providerRefundRef: `dev_refund_${randomUUID()}`,
      raw: {
        simulated: true,
        providerRef: input.providerRef,
        amount: input.amount,
      },
    });
  }

  verifyWebhookSignature(): boolean {
    // Development-only: no signing secret exists to verify against. A real
    // adapter (Razorpay/Stripe) must reject unsigned/invalid webhook bodies.
    return true;
  }
}

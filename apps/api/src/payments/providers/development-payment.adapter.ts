import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  constructor(private readonly config: ConfigService) {}

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

  /**
   * Simulates a real provider's HMAC-signed webhook (e.g. Razorpay's `X-Razorpay-Signature`,
   * Stripe's `Stripe-Signature`) rather than trusting every request unconditionally — even
   * though this is the development adapter, `POST /payments/webhook` is `@Public()` today
   * (no provider is real yet to gate it), so an unconditional `true` here would let anyone
   * forge a payment-succeeded event against a real `providerRef`. Unset `PAYMENT_SECRET`
   * fails closed (rejects every webhook), never open.
   */
  verifyWebhookSignature(
    payload: string,
    signature: string | undefined,
  ): boolean {
    const secret = this.config.get<string>('payments.webhookSecret');
    if (!secret || !signature) return false;

    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const signatureBuf = Buffer.from(signature, 'hex');
    if (expectedBuf.length !== signatureBuf.length) return false;
    return timingSafeEqual(expectedBuf, signatureBuf);
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProviderType } from '@prisma/client';
import Razorpay from 'razorpay';
import { validatePaymentVerification } from 'razorpay/dist/utils/razorpay-utils';
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
 * Real Razorpay integration behind the same PaymentProvider interface
 * DevelopmentPaymentAdapter implements. The SDK client is constructed lazily (not in the
 * constructor) so a missing RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET only ever fails when this
 * adapter is actually invoked *and* actually selected (payments.provider === 'razorpay') —
 * every dev/test boot with the dev adapter selected stays completely unaffected, matching the
 * webhook secret's own existing "fails closed at use, not at boot" precedent.
 */
@Injectable()
export class RazorpayPaymentAdapter implements PaymentProvider {
  readonly type = PaymentProviderType.RAZORPAY;

  private client: Razorpay | undefined;

  constructor(private readonly config: ConfigService) {}

  private getClient(): Razorpay {
    if (this.client) return this.client;
    const keyId = this.config.get<string>('payments.razorpay.keyId');
    const keySecret = this.config.get<string>('payments.razorpay.keySecret');
    if (!keyId || !keySecret) {
      throw new Error(
        'RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET must be set to use the Razorpay payment provider.',
      );
    }
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    return this.client;
  }

  private getWebhookSecret(): string | undefined {
    return this.config.get<string>('payments.webhookSecret');
  }

  async createIntent(input: CreateIntentInput): Promise<CreateIntentResult> {
    const order = await this.getClient().orders.create({
      // Razorpay amounts are always in the smallest currency subunit (paise for INR).
      amount: Math.round(input.amount * 100),
      currency: input.currency,
      receipt: input.idempotencyKey,
      notes: { orderId: input.orderId },
    });
    return {
      providerRef: order.id,
      raw: order as unknown as Record<string, unknown>,
    };
  }

  async confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResult> {
    const razorpayPaymentId = input.payload?.razorpayPaymentId;
    const razorpaySignature = input.payload?.razorpaySignature;
    if (typeof razorpayPaymentId !== 'string' || typeof razorpaySignature !== 'string') {
      return {
        success: false,
        raw: {},
        failureReason: 'Missing Razorpay payment verification fields.',
      };
    }

    const keySecret = this.config.get<string>('payments.razorpay.keySecret');
    if (!keySecret) {
      throw new Error('RAZORPAY_KEY_SECRET must be set to use the Razorpay payment provider.');
    }

    // A valid signature is cryptographic proof Razorpay itself certified this exact
    // (order_id, payment_id) pairing using a secret only Razorpay and this server know — no
    // separate payments.fetch() cross-check is needed on top of it.
    const verified = validatePaymentVerification(
      { order_id: input.providerRef, payment_id: razorpayPaymentId },
      razorpaySignature,
      keySecret,
    );
    if (!verified) {
      return {
        success: false,
        raw: { razorpayPaymentId, razorpayOrderId: input.providerRef },
        failureReason: 'Razorpay payment signature verification failed.',
      };
    }

    return {
      success: true,
      raw: { razorpayPaymentId, razorpayOrderId: input.providerRef },
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    // Razorpay refunds operate on the payment id, not the order id — the caller
    // (RefundsService/ReturnsService) is responsible for passing Payment.providerPaymentRef
    // here, not the order-id-holding providerRef.
    const refund = await this.getClient().payments.refund(input.providerRef, {
      amount: Math.round(input.amount * 100),
      notes: { reason: input.reason },
    });
    return {
      success: refund.status !== 'failed',
      providerRefundRef: refund.id,
      raw: refund as unknown as Record<string, unknown>,
      failureReason: refund.status === 'failed' ? 'Razorpay refund failed.' : undefined,
    };
  }

  verifyWebhookSignature(payload: string, signature: string | undefined): boolean {
    const secret = this.getWebhookSecret();
    if (!secret || !signature) return false;
    return Razorpay.validateWebhookSignature(payload, signature, secret);
  }
}

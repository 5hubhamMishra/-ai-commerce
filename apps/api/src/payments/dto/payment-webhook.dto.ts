import { IsBoolean, IsString } from 'class-validator';

/**
 * Shape the development adapter's simulated provider posts back. A real
 * Razorpay/Stripe adapter would parse that provider's own webhook envelope here
 * instead — the interface (verifyWebhookSignature + confirmPayment) doesn't change.
 */
export class PaymentWebhookDto {
  @IsString()
  providerRef!: string;

  @IsBoolean()
  success!: boolean;
}

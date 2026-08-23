import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ConfirmPaymentDto {
  // Development/testing hook only — lets the e2e suite deterministically exercise
  // the payment-declined path without a real gateway. A real provider adapter
  // ignores client-supplied outcome fields entirely (spec: never trust the
  // frontend for payment success/state).
  @IsOptional()
  @IsBoolean()
  simulateFailure?: boolean;

  // Real Razorpay Checkout handoff: the browser widget returns these two fields to the
  // client on success, which POSTs them here for server-side signature verification.
  // RazorpayPaymentAdapter is what actually trusts or distrusts them — a client can send
  // anything, but only a value Razorpay itself signed will ever verify successfully.
  @IsOptional()
  @IsString()
  razorpayPaymentId?: string;

  @IsOptional()
  @IsString()
  razorpaySignature?: string;
}

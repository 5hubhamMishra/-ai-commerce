import { IsBoolean, IsOptional } from 'class-validator';

export class ConfirmPaymentDto {
  // Development/testing hook only — lets the e2e suite deterministically exercise
  // the payment-declined path without a real gateway. A real provider adapter
  // ignores client-supplied outcome fields entirely (spec: never trust the
  // frontend for payment success/state).
  @IsOptional()
  @IsBoolean()
  simulateFailure?: boolean;
}

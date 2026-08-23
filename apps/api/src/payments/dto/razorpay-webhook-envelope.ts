/**
 * Razorpay's real webhook payload shape — a nested JSON envelope, nothing like the flat
 * PaymentWebhookDto the dev adapter's simulated webhook route uses. Not a class-validator DTO:
 * the route this feeds reads the raw request body directly (@Req().rawBody) for HMAC
 * verification, bypassing @Body()/ValidationPipe entirely, so a decorated class would never
 * actually run through the validation pipe anyway.
 */
export interface RazorpayWebhookEnvelope {
  entity: string;
  event: string;
  payload: {
    payment?: {
      entity: {
        id: string;
        order_id: string;
        status: string;
      };
    };
  };
  created_at: number;
}

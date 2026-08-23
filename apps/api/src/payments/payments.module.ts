import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersModule } from '../orders/orders.module';
import { DevelopmentPaymentAdapter } from './providers/development-payment.adapter';
import { RazorpayPaymentAdapter } from './providers/razorpay-payment.adapter';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController],
  providers: [
    DevelopmentPaymentAdapter,
    RazorpayPaymentAdapter,
    {
      provide: PAYMENT_PROVIDER,
      // Both adapters are cheap to construct (no I/O, no eager credential validation — see
      // RazorpayPaymentAdapter's lazy SDK client), so this just picks which one to bind.
      // Defaults to the dev adapter — every existing dev/test/e2e environment stays
      // unaffected without needing any env changes.
      useFactory: (
        config: ConfigService,
        dev: DevelopmentPaymentAdapter,
        razorpay: RazorpayPaymentAdapter,
      ) =>
        config.get<string>('payments.provider') === 'razorpay' ? razorpay : dev,
      inject: [
        ConfigService,
        DevelopmentPaymentAdapter,
        RazorpayPaymentAdapter,
      ],
    },
    PaymentsService,
  ],
  // PAYMENT_PROVIDER is exported too, so RefundsModule can inject the same
  // provider instance for refund() without duplicating the adapter wiring.
  exports: [PaymentsService, PAYMENT_PROVIDER],
})
export class PaymentsModule {}

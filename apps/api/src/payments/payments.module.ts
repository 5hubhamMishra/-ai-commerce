import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { DevelopmentPaymentAdapter } from './providers/development-payment.adapter';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController],
  providers: [
    DevelopmentPaymentAdapter,
    { provide: PAYMENT_PROVIDER, useExisting: DevelopmentPaymentAdapter },
    PaymentsService,
  ],
  // PAYMENT_PROVIDER is exported too, so RefundsModule can inject the same
  // provider instance for refund() without duplicating the adapter wiring.
  exports: [PaymentsService, PAYMENT_PROVIDER],
})
export class PaymentsModule {}

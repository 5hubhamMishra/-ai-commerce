import { Module } from '@nestjs/common';
import { DevelopmentShippingAdapter } from './providers/development-shipping.adapter';
import { SHIPPING_PROVIDER } from './providers/shipping-provider.interface';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';

@Module({
  controllers: [ShippingController],
  providers: [
    DevelopmentShippingAdapter,
    { provide: SHIPPING_PROVIDER, useExisting: DevelopmentShippingAdapter },
    ShippingService,
  ],
  exports: [ShippingService],
})
export class ShippingModule {}

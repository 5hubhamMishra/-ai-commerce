import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ShippingQuoteQueryDto } from './dto/shipping-quote-query.dto';
import { ShippingService } from './shipping.service';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get('quote')
  quote(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ShippingQuoteQueryDto,
  ) {
    return this.shippingService.quoteForCart(user.id, query.addressId);
  }
}

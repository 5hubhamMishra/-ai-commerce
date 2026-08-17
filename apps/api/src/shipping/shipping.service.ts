import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ShippingMethodQuote } from './providers/shipping-provider.interface';
import { SHIPPING_PROVIDER } from './providers/shipping-provider.interface';
import type { ShippingProvider } from './providers/shipping-provider.interface';

@Injectable()
export class ShippingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SHIPPING_PROVIDER) private readonly provider: ShippingProvider,
  ) {}

  /** Quotes shipping methods for the caller's current cart, priced against a specific address. */
  async quoteForCart(
    userId: string,
    addressId: string,
  ): Promise<ShippingMethodQuote[]> {
    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
    });
    if (!address || address.userId !== userId) {
      throw new NotFoundException({
        code: 'ADDRESS_NOT_FOUND',
        message: 'Address not found.',
      });
    }

    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: { include: { variant: true } } },
    });
    const items = cart?.items ?? [];
    if (items.length === 0) {
      // Same code/status OrdersService uses for the same condition (an empty
      // cart is an invalid request state, not a missing resource — 400, not 404).
      throw new BadRequestException({
        code: 'CART_EMPTY',
        message: 'Your cart is empty — there is nothing to quote shipping for.',
      });
    }

    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.variant.price) * item.quantity,
      0,
    );
    const totalWeightGrams = items.reduce(
      (sum, item) => sum + (item.variant.weightGrams ?? 0) * item.quantity,
      0,
    );
    const currency = items[0]?.variant.currency ?? 'INR';

    return this.provider.quote({
      address: {
        line1: address.line1,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        country: address.country,
      },
      subtotal,
      currency,
      totalWeightGrams,
    });
  }
}

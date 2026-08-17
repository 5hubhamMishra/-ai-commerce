import { Injectable } from '@nestjs/common';
import type {
  ShippingAddressInput,
  ShippingMethodQuote,
  ShippingProvider,
  ShippingQuoteInput,
} from './shipping-provider.interface';

// Matches the flat-rate/free-shipping-threshold rule already used by apps/web's
// cart page (₹149 flat under ₹5000, free at/above it) — kept consistent rather
// than inventing new numbers the frontend doesn't already show.
const FREE_SHIPPING_THRESHOLD = 5000;
const STANDARD_FLAT_FEE = 149;
const EXPRESS_FLAT_FEE = 299;

@Injectable()
export class DevelopmentShippingAdapter implements ShippingProvider {
  quote(input: ShippingQuoteInput): Promise<ShippingMethodQuote[]> {
    const standardFee =
      input.subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_FLAT_FEE;

    return Promise.resolve([
      {
        method: 'STANDARD',
        label: 'Standard delivery',
        fee: standardFee,
        currency: input.currency,
        estimatedDaysMin: 5,
        estimatedDaysMax: 7,
      },
      {
        method: 'EXPRESS',
        label: 'Express delivery',
        fee: EXPRESS_FLAT_FEE,
        currency: input.currency,
        estimatedDaysMin: 2,
        estimatedDaysMax: 3,
      },
    ]);
  }

  validateAddress(address: ShippingAddressInput): Promise<boolean> {
    // Development-only: structural check that required fields are present. A real
    // adapter would call a carrier/postal API to confirm the address is deliverable.
    return Promise.resolve(
      Boolean(
        address.line1?.trim() &&
        address.city?.trim() &&
        address.state?.trim() &&
        address.postalCode?.trim() &&
        address.country?.trim(),
      ),
    );
  }
}

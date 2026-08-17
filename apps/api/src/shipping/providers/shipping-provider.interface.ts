export type ShippingAddressInput = {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type ShippingQuoteInput = {
  address: ShippingAddressInput;
  subtotal: number;
  currency: string;
  totalWeightGrams: number;
};

export type ShippingMethodQuote = {
  method: string;
  label: string;
  fee: number;
  currency: string;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
};

/**
 * Provider abstraction so a real carrier/rate API can replace this later without
 * touching ShippingService or checkout (spec: "Keep shipping-provider integration
 * behind adapters"). Only DevelopmentShippingAdapter exists in Phase 3 — full
 * carrier tracking-event ingestion is Phase 4 (Post-Purchase) territory.
 */
export interface ShippingProvider {
  quote(input: ShippingQuoteInput): Promise<ShippingMethodQuote[]>;
  validateAddress(address: ShippingAddressInput): Promise<boolean>;
}

export const SHIPPING_PROVIDER = Symbol('SHIPPING_PROVIDER');

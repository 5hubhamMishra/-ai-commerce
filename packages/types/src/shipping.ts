/** Matches `ShippingMethodQuote` in
 *  apps/api/src/shipping/providers/shipping-provider.interface.ts. */
export type ShippingMethodQuote = {
  method: string;
  label: string;
  fee: number;
  currency: string;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
};

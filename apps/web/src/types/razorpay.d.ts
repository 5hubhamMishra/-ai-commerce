// Minimal ambient declaration for the Razorpay Checkout widget, loaded client-side via
// https://checkout.razorpay.com/v1/checkout.js (apps/web/src/app/checkout/page.tsx). There is
// no @types/razorpay package for this — the `razorpay` npm package (apps/api) is the
// server-side SDK only and ships its own types; every real-world Checkout.js integration
// hand-rolls this ambient global.
export {};

declare global {
  interface RazorpayCheckoutResponse {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }

  interface RazorpayCheckoutOptions {
    key: string;
    order_id: string;
    amount: number;
    currency: string;
    name?: string;
    handler: (response: RazorpayCheckoutResponse) => void;
    modal?: { ondismiss?: () => void };
  }

  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open(): void };
  }
}

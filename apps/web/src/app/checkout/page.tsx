"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import Link from "next/link";
import { SkeletonBlock, SkeletonText } from "@/components/Skeleton";

export default function CheckoutPage() {
  const router = useRouter();
  const serverCart = useStore((s) => s.serverCart);
  const placeOrder = useStore((s) => s.placeOrder);
  const clearServerCart = useStore((s) => s.clearServerCart);
  const trackEvent = useStore((s) => s.trackEvent);
  const hydrated = useStore((s) => s.hydrated);
  const [address, setAddress] = useState("");
  const [placing, setPlacing] = useState(false);

  const lines = serverCart?.items ?? [];
  const total = serverCart?.subtotal ?? 0;

  useEffect(() => {
    if (hydrated && lines.length > 0) trackEvent("CHECKOUT_STARTED", {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:px-8 pb-16">
        <SkeletonText className="h-7 w-32 mb-8" />
        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <SkeletonBlock className="h-64 w-full" />
          <SkeletonBlock className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 flex flex-col items-center text-center">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--clr-border-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
        <h1 className="font-display text-2xl font-semibold mt-6">Your cart is empty</h1>
        <p className="mt-2 text-sm max-w-xs" style={{ color: 'var(--clr-text-secondary)' }}>You cannot checkout with an empty cart.</p>
        <Link href="/shop" className="mt-6 btn btn-accent">Browse products</Link>
      </div>
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    setPlacing(true);
    // Payment is simulated client-side for this demo. In production this must be verified
    // server-side against the payment provider before an order is ever confirmed.
    setTimeout(() => {
      const order = placeOrder(
        address.trim(),
        lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          priceAtPurchase: l.unitPrice,
          productName: l.productName,
          productImageUrl: l.imageUrl,
        })),
      );
      void clearServerCart();
      router.push(`/orders/${order.id}`);
    }, 700);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:px-8 pb-16">
      <div className="flex items-center gap-2 text-xs font-semibold mb-8">
        <span className="badge badge-success">1 Cart</span>
        <span style={{ color: 'var(--clr-border-strong)' }}>›</span>
        <span className="badge badge-accent">2 Shipping</span>
        <span style={{ color: 'var(--clr-border-strong)' }}>›</span>
        <span className="text-[var(--clr-text-disabled)]">3 Payment</span>
      </div>
      
      <h1 className="font-display text-2xl font-semibold">Checkout</h1>
      
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <form onSubmit={onSubmit} className="space-y-6">
          <div>
            <label htmlFor="checkout-address" className="block text-sm font-semibold mb-2" style={{ color: 'var(--clr-text-primary)' }}>Shipping address</label>
            <textarea
              id="checkout-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              rows={3}
              placeholder="House no, street, city, state, PIN code"
              className="rounded-2xl border border-[var(--clr-border)] px-4 py-3 text-sm outline-none w-full resize-none focus:border-[var(--clr-accent)] focus:ring-1 focus:ring-[var(--clr-accent)] transition-all shadow-sm bg-[var(--clr-surface)]"
            />
          </div>

          <div>
            <h2 className="block text-sm font-semibold mb-2" style={{ color: 'var(--clr-text-primary)' }}>Payment method</h2>
            <div className="rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface-2)] p-4 flex gap-3 items-start">
              <svg className="shrink-0 mt-0.5" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--clr-text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <div>
                <p className="text-sm font-semibold text-[var(--clr-text-primary)]">Demo checkout</p>
                <p className="text-xs text-[var(--clr-text-secondary)] mt-1">
                  No real payment is processed. In production this step hands off to a payment provider and the order is confirmed only after server-side verification.
                </p>
              </div>
            </div>
          </div>
          
          <button
            type="submit"
            disabled={placing}
            className={`w-full py-3.5 text-sm rounded-2xl font-bold flex justify-center items-center gap-2 ${placing ? 'bg-[var(--clr-accent-hover)] text-white opacity-80 cursor-not-allowed' : 'btn btn-accent'}`}
          >
            {placing ? (
              <>
                <div className="animate-spin border-2 border-white/30 border-t-white rounded-full w-4 h-4"></div>
                Placing order…
              </>
            ) : (
              `Place order — ${formatPrice(total)}`
            )}
          </button>
        </form>

        <div className="h-fit sticky top-24 rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-6 shadow-card">
          <h2 className="font-display text-lg font-semibold mb-4">Order Summary</h2>
          <div className="space-y-3">
            {lines.map((l) => (
              <div key={l.id} className="flex justify-between text-sm text-[var(--clr-text-secondary)]">
                <span className="line-clamp-2 pr-2">
                  {l.productName} <span className="font-semibold">× {l.quantity}</span>
                </span>
                <span className="shrink-0 font-medium">{formatPrice(l.lineTotal)}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-[var(--clr-border)] flex justify-between items-center text-xl font-bold">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

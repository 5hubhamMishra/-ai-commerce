"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { RowsPageSkeleton } from "@/components/Skeleton";

export default function CartPage() {
  const authStatus = useStore((s) => s.authStatus);
  const cart = useStore((s) => s.serverCart);
  const cartStatus = useStore((s) => s.serverCartStatus);
  const fetchCart = useStore((s) => s.fetchServerCart);
  const updateItem = useStore((s) => s.updateServerCartItem);
  const removeItem = useStore((s) => s.removeServerCartItem);

  useEffect(() => {
    if (authStatus === "authenticated" && !cart) {
      void fetchCart();
    }
  }, [authStatus, cart, fetchCart]);

  if (authStatus === "idle" || authStatus === "checking") {
    return <RowsPageSkeleton rows={2} />;
  }

  if (authStatus !== "authenticated") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 flex flex-col items-center text-center">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--clr-border-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
        <h1 className="font-display text-2xl font-semibold mt-6">Sign in to see your cart</h1>
        <p className="mt-2 text-sm max-w-xs" style={{ color: 'var(--clr-text-secondary)' }}>Your cart is tied to your account.</p>
        <Link href="/login?redirect=/cart" className="mt-6 btn btn-accent">Sign in</Link>
      </div>
    );
  }

  if (cartStatus === "loading" && !cart) {
    return <RowsPageSkeleton rows={2} />;
  }

  const items = cart?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 flex flex-col items-center text-center">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--clr-border-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
        <h1 className="font-display text-2xl font-semibold mt-6">Your cart is empty</h1>
        <p className="mt-2 text-sm max-w-xs" style={{ color: 'var(--clr-text-secondary)' }}>Add some products and they’ll appear here.</p>
        <Link href="/shop" className="mt-6 btn btn-accent">Browse products</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="font-display text-2xl font-semibold flex items-center">
        Your cart
        <span className="ml-2 badge badge-subtle">{items.length} items</span>
      </h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-4 flex gap-4 hover:border-[var(--clr-border-strong)] transition-colors">
              <div className="relative h-24 w-24 shrink-0 rounded-xl overflow-hidden bg-stone-50">
                {item.imageUrl && <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <Link href={`/products/${item.productSlug}`} className="text-sm font-semibold line-clamp-2 hover:text-[var(--clr-accent)] transition-colors">
                  {item.productName}
                </Link>
                {item.attributes.length > 0 && (
                  <p className="text-xs mt-0.5 text-[var(--clr-text-disabled)]">
                    {item.attributes.map((a) => `${a.attribute}: ${a.value}`).join(", ")}
                  </p>
                )}
                <p className="text-base font-bold mt-2">{formatPrice(item.unitPrice)}</p>
                {!item.isAvailable && (
                  <p className="text-xs mt-1" style={{ color: "var(--clr-error)" }}>No longer available</p>
                )}
                {item.isAvailable && item.insufficientStock && (
                  <p className="text-xs mt-1" style={{ color: "var(--clr-warning-text)" }}>
                    Only {item.availableQuantity} left
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end justify-between shrink-0">
                <button
                  onClick={() => removeItem(item.id)}
                  aria-label={`Remove ${item.productName} from cart`}
                  className="text-xs text-[var(--clr-text-disabled)] hover:text-[var(--clr-error)] transition-colors"
                >
                  Remove
                </button>
                <div className="flex items-center rounded-xl border border-[var(--clr-border)] overflow-hidden">
                  <button
                    onClick={() => updateItem(item.id, item.quantity - 1)}
                    aria-label={`Decrease quantity of ${item.productName}`}
                    className="px-3 py-2 text-sm font-medium hover:bg-stone-50"
                  >
                    −
                  </button>
                  <span className="w-9 text-center text-sm font-semibold">{item.quantity}</span>
                  <button
                    onClick={() => updateItem(item.id, item.quantity + 1)}
                    aria-label={`Increase quantity of ${item.productName}`}
                    className="px-3 py-2 text-sm font-medium hover:bg-stone-50"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="h-fit sticky top-24 rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-6 shadow-card">
          <h2 className="font-display text-lg font-semibold">Order Summary</h2>
          <div className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between" style={{ color: 'var(--clr-text-secondary)' }}>
              <span>Subtotal</span>
              <span>{formatPrice(cart?.subtotal ?? 0)}</span>
            </div>
          </div>

          {cart?.hasUnavailableItems && (
            <p className="mt-3 text-xs" style={{ color: "var(--clr-warning-text)" }}>
              Some items above are unavailable and excluded from the subtotal.
            </p>
          )}

          <div className="mt-5 pt-4 border-t border-[var(--clr-border)] flex justify-between items-center text-xl font-bold">
            <span>Total</span>
            <span>{formatPrice(cart?.subtotal ?? 0)}</span>
          </div>
          <Link
            href="/checkout"
            className="mt-5 block btn btn-accent w-full text-center py-3 text-sm"
          >
            Checkout
          </Link>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { getProduct } from "@/lib/data";
import { formatPrice } from "@/lib/format";
import { frequentlyBoughtWith } from "@/lib/recommend";
import ProductGrid from "@/components/ProductGrid";

export default function CartPage() {
  const cart = useStore((s) => s.cart);
  const updateQuantity = useStore((s) => s.updateCartQuantity);
  const removeFromCart = useStore((s) => s.removeFromCart);
  const hydrated = useStore((s) => s.hydrated);

  const lines = useMemo(
    () => cart.map((c) => ({ ...c, product: getProduct(c.productId) })).filter((l) => l.product),
    [cart]
  );
  const subtotal = lines.reduce((sum, l) => sum + (l.product?.price || 0) * l.quantity, 0);
  const shipping = subtotal > 0 && subtotal < 5000 ? 149 : 0;
  const total = subtotal + shipping;

  const suggestions = useMemo(() => {
    if (lines.length === 0 || !lines[0].product) return [];
    return frequentlyBoughtWith(lines[0].product, 5);
  }, [lines]);

  if (!hydrated) return null;

  if (lines.length === 0) {
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
        <span className="ml-2 badge badge-subtle">{lines.length} items</span>
      </h1>
      
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {lines.map((line) => (
            <div key={line.productId} className="rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-4 flex gap-4 hover:border-[var(--clr-border-strong)] transition-colors">
              <div className="relative h-24 w-24 shrink-0 rounded-xl overflow-hidden bg-stone-50">
                <Image src={line.product!.images[0]} alt={line.product!.name} fill className="object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <Link href={`/product/${line.productId}`} className="text-sm font-semibold line-clamp-2 hover:text-[var(--clr-accent)] transition-colors">
                  {line.product!.name}
                </Link>
                <p className="text-xs mt-0.5 text-[var(--clr-text-disabled)]">{line.product!.brand}</p>
                <p className="text-base font-bold mt-2">{formatPrice(line.product!.price)}</p>
              </div>
              <div className="flex flex-col items-end justify-between shrink-0">
                <button onClick={() => removeFromCart(line.productId)} className="text-xs text-[var(--clr-text-disabled)] hover:text-[var(--clr-error)] transition-colors">
                  Remove
                </button>
                <div className="flex items-center rounded-xl border border-[var(--clr-border)] overflow-hidden">
                  <button
                    onClick={() => updateQuantity(line.productId, line.quantity - 1)}
                    className="px-3 py-2 text-sm font-medium hover:bg-stone-50"
                  >
                    −
                  </button>
                  <span className="w-9 text-center text-sm font-semibold">{line.quantity}</span>
                  <button
                    onClick={() => updateQuantity(line.productId, line.quantity + 1)}
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
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between" style={{ color: 'var(--clr-text-secondary)' }}>
              <span>Shipping</span>
              <span>{shipping === 0 ? "Free" : formatPrice(shipping)}</span>
            </div>
          </div>
          
          {subtotal > 0 && subtotal < 5000 ? (
            <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
              <div className="h-1.5 rounded-full bg-amber-100 overflow-hidden">
                <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${(subtotal/5000*100).toFixed(0)}%` }}></div>
              </div>
              <p className="text-xs text-amber-800 mt-1.5 font-medium">
                Add {formatPrice(5000 - subtotal)} for free shipping
              </p>
            </div>
          ) : subtotal >= 5000 ? (
            <div className="mt-3">
              <span className="badge badge-success">✓ Free shipping unlocked</span>
            </div>
          ) : null}

          <div className="mt-5 pt-4 border-t border-[var(--clr-border)] flex justify-between items-center text-xl font-bold">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
          <Link
            href="/checkout"
            className="mt-5 block btn btn-accent w-full text-center py-3 text-sm"
          >
            Checkout
          </Link>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-12 pt-8 border-t border-[var(--clr-border)]">
          <h2 className="font-display text-xl mb-6 font-semibold">You might also like</h2>
          <ProductGrid products={suggestions} />
        </div>
      )}
    </div>
  );
}

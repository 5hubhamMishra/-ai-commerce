"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { getProduct } from "@/lib/data";
import ProductGrid from "@/components/ProductGrid";
import type { Product } from "@/lib/types";

export default function WishlistPage() {
  const wishlist = useStore((s) => s.wishlist);
  const hydrated = useStore((s) => s.hydrated);
  const products = useMemo(
    () => wishlist.map((id) => getProduct(id)).filter((p): p is Product => Boolean(p)),
    [wishlist]
  );

  if (!hydrated) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 pb-2 sm:px-6 lg:px-8">
      <h1 className="font-display text-2xl font-semibold flex items-center mb-6">
        Your Wishlist
        <span className="ml-2 badge badge-subtle">{products.length} items</span>
      </h1>
      
      {products.length === 0 ? (
        <div className="mx-auto max-w-7xl py-16">
          <div className="empty-state flex flex-col items-center">
            <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="var(--clr-border-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <h2 className="font-display text-xl font-semibold mt-4">Nothing saved yet</h2>
            <p className="text-sm mt-2 max-w-xs text-center" style={{ color: 'var(--clr-text-secondary)' }}>Tap the heart on any product to save it here for later.</p>
            <Link href="/shop" className="mt-5 btn btn-accent">Explore products</Link>
          </div>
        </div>
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  );
}

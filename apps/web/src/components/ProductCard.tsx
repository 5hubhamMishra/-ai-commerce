"use client";
import Link from "next/link";
import Image from "next/image";
import { useState, useCallback } from "react";
import { formatPrice } from "@/lib/format";
import { discountPercent } from "@/lib/data";
import { useStore } from "@/lib/store";
import type { Product } from "@/lib/types";
import RatingStars from "./RatingStars";

export default function ProductCard({ product, reason }: { product: Product; reason?: string }) {
  const inWishlist = useStore((s) => s.wishlist.includes(product.id));
  const toggleWishlist = useStore((s) => s.toggleWishlist);
  const addToCart = useStore((s) => s.addToCart);
  const trackEvent = useStore((s) => s.trackEvent);
  const [heartAnimating, setHeartAnimating] = useState(false);
  const [cartAdded, setCartAdded] = useState(false);
  
  const discount = discountPercent(product);
  
  const handleWishlist = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setHeartAnimating(true);
    toggleWishlist(product.id);
    setTimeout(() => setHeartAnimating(false), 380);
  }, [product.id, toggleWishlist]);
  
  const handleAddToCart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (product.stock === 0) return;
    addToCart(product.id);
    setCartAdded(true);
    setTimeout(() => setCartAdded(false), 1400);
  }, [product.id, product.stock, addToCart]);
  
  const hasDiscount = discount > 0;
  const isLowStock = product.stock > 0 && product.stock < 10;
  
  return (
    <div 
      className="rounded-2xl overflow-hidden bg-white flex flex-col relative group"
      style={{ 
        boxShadow: 'var(--shadow-card)', 
        transition: 'box-shadow 200ms ease, transform 200ms ease',
        transform: 'translateY(0)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = 'var(--shadow-lift)';
        e.currentTarget.style.transform = 'translateY(-4px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'var(--shadow-card)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <button 
        onClick={handleWishlist}
        className="absolute right-3 top-3 z-10 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center transition-all duration-200"
        style={{ 
          border: '1px solid var(--clr-border)',
          boxShadow: 'var(--shadow-xs)'
        }}
        aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
      >
        <svg 
          viewBox="0 0 24 24" 
          width="18" 
          height="18"
          style={{ 
            animation: heartAnimating ? 'heartPop 0.38s ease forwards' : undefined,
            fill: inWishlist ? 'var(--clr-accent)' : 'none',
            stroke: inWishlist ? 'var(--clr-accent)' : 'currentColor',
            strokeWidth: 2
          }}
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>

      <Link href={`/product/${product.id}`} onClick={() => trackEvent("PRODUCT_CLICKED", { productId: product.id })} className="flex-1 flex flex-col">
        <div className="relative aspect-square overflow-hidden bg-stone-50">
          <Image 
            src={product.images[0]} 
            alt={product.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
            {hasDiscount && (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-[var(--clr-ink)] shadow-sm">
                -{discount}%
              </span>
            )}
            {isLowStock && (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[var(--clr-warning-bg)] text-[var(--clr-warning-text)] shadow-sm">
                Only {product.stock} left
              </span>
            )}
          </div>
          {product.stock === 0 && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-20">
              <span className="px-4 py-1.5 rounded-full bg-stone-900 text-white text-xs font-bold tracking-widest uppercase shadow-sm">
                Out of Stock
              </span>
            </div>
          )}
        </div>

        <div className="p-3 pb-0 flex flex-col flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--clr-text-disabled)]">
            {product.brand}
          </p>
          <h3 className="mt-0.5 text-sm font-medium leading-snug line-clamp-2 text-[var(--clr-text-primary)]">
            {product.name}
          </h3>
          <div className="mt-1">
            <RatingStars rating={product.rating} count={product.reviewCount} />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-sm font-bold">{formatPrice(product.price)}</span>
            {hasDiscount && (
              <>
                <span className="text-xs line-through text-[var(--clr-text-disabled)]">
                  {formatPrice(product.compareAtPrice!)}
                </span>
                <span className="text-[10px] font-medium text-[var(--clr-success-text)]">
                  Save {formatPrice(product.compareAtPrice! - product.price)}
                </span>
              </>
            )}
          </div>
        </div>
      </Link>

      {reason && (
        <div className="px-3 pt-2">
          <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-[var(--clr-accent-subtle)]">
            <svg viewBox="0 0 24 24" width="10" height="10" fill="var(--clr-accent)" className="flex-shrink-0">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span className="text-[10px] font-medium line-clamp-1 text-[var(--clr-accent-text)]">
              {reason}
            </span>
          </div>
        </div>
      )}

      <div className="mt-auto p-3 pt-2">
        <button
          onClick={handleAddToCart}
          disabled={product.stock === 0}
          className={`w-full rounded-xl py-2.5 text-xs font-semibold transition-colors duration-200 ${
            product.stock === 0 
              ? 'bg-[var(--clr-surface-2)] text-[var(--clr-text-disabled)]'
              : cartAdded
                ? 'bg-[var(--clr-success-text)] text-white'
                : 'bg-[var(--clr-ink)] text-white hover:bg-[var(--clr-accent)]'
          }`}
        >
          {product.stock === 0 
            ? 'Unavailable' 
            : cartAdded 
              ? '✓ Added to cart' 
              : 'Add to cart'
          }
        </button>
      </div>
    </div>
  );
}

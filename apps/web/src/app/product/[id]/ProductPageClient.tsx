"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { getProduct, getReviewsFor, discountPercent } from "@/lib/data";
import { similarProducts, frequentlyBoughtWith } from "@/lib/recommend";
import { formatPrice } from "@/lib/format";
import { useStore } from "@/lib/store";
import RatingStars from "@/components/RatingStars";
import ProductGrid from "@/components/ProductGrid";
import Section from "@/components/Section";

function getCategorySlug(categoryName: string) {
  return categoryName.toLowerCase().replace(/\s+/g, "-");
}

export default function ProductPageClient({ id }: { id: string }) {
  const product = getProduct(id);
  const recordView = useStore((s) => s.recordView);
  const addToCart = useStore((s) => s.addToCart);
  const toggleWishlist = useStore((s) => s.toggleWishlist);
  const inWishlist = useStore((s) => s.wishlist.includes(id));
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    if (product) recordView(product.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const reviews = useMemo(() => (product ? getReviewsFor(product.id) : []), [product]);
  const similar = useMemo(() => (product ? similarProducts(product) : []), [product]);
  const complements = useMemo(() => (product ? frequentlyBoughtWith(product) : []), [product]);

  // The server-side page.tsx already calls notFound() for a missing product
  // before this client component ever renders — this null-check only
  // covers the (unreachable in practice) type narrowing for TypeScript.
  if (!product) return null;
  const discount = discountPercent(product);
  const savings = product.compareAtPrice ? product.compareAtPrice - product.price : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="text-xs mb-6" style={{ color: 'var(--clr-text-secondary)' }}>
        <Link href="/" className="hover:underline">Home</Link> ›{" "}
        <Link href={`/category/${getCategorySlug(product.category)}`} className="hover:underline">{product.category}</Link> ›{" "}
        {product.name}
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-stone-50 shadow-sm">
            <Image src={product.images[activeImage] || product.images[0]} alt={product.name} fill className="object-cover" priority />
            {discount > 0 && (
              <span className="absolute left-3 top-3 badge badge-accent">
                -{discount}% off
              </span>
            )}
          </div>
          {product.images.length > 1 && (
            <div className="mt-3 flex gap-2">
              {product.images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  aria-label={`Show image ${i + 1} of ${product.images.length}`}
                  aria-pressed={activeImage === i}
                  className={`relative h-16 w-16 rounded-xl overflow-hidden ring-2 transition-all ${
                    activeImage === i
                      ? "ring-[var(--clr-accent)]"
                      : "ring-transparent hover:ring-[var(--clr-border-strong)]"
                  }`}
                >
                  <Image src={img} alt={`${product.name} thumbnail ${i + 1}`} fill className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--clr-text-disabled)' }}>{product.brand}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold leading-tight" style={{ color: 'var(--clr-text-primary)' }}>{product.name}</h1>
          <div className="mt-2 flex items-center gap-2">
            <RatingStars rating={product.rating} count={product.reviewCount} />
            <span className="text-sm" style={{ color: 'var(--clr-text-secondary)' }}>{product.reviewCount} reviews</span>
          </div>

          <div className="mt-4 h-px bg-[var(--clr-border)]" />

          <div className="mt-4 flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-bold" style={{ color: 'var(--clr-text-primary)' }}>{formatPrice(product.price)}</span>
            {product.compareAtPrice && (
              <span className="text-base text-[var(--clr-text-disabled)] line-through">{formatPrice(product.compareAtPrice)}</span>
            )}
            {savings > 0 && (
              <span className="badge badge-success">
                Save {formatPrice(savings)}
              </span>
            )}
          </div>

          <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--clr-text-secondary)' }}>{product.description}</p>

          <p className="mt-3 flex items-center gap-2 text-sm font-medium">
            {product.stock > 0 ? (
              <>
                <span className={`h-2 w-2 rounded-full ${product.stock < 10 ? 'bg-[var(--clr-warning)]' : 'bg-[var(--clr-success)]'}`} />
                <span style={{ color: 'var(--clr-text-primary)' }}>{product.stock < 10 ? `Only ${product.stock} left` : "In stock"}</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-[var(--clr-error)]" />
                <span style={{ color: 'var(--clr-error)' }}>Out of stock</span>
              </>
            )}
          </p>

          <div className="mt-6 flex gap-3">
            <div className="flex items-center rounded-xl border" style={{ borderColor: 'var(--clr-border)' }}>
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="px-3 py-2.5 text-lg font-medium hover:bg-stone-50 transition-colors" style={{ color: 'var(--clr-text-secondary)' }}>
                −
              </button>
              <span className="w-10 text-center text-sm font-semibold" style={{ color: 'var(--clr-text-primary)' }} aria-live="polite">{qty}</span>
              <button onClick={() => setQty((q) => q + 1)} aria-label="Increase quantity" className="px-3 py-2.5 text-lg font-medium hover:bg-stone-50 transition-colors" style={{ color: 'var(--clr-text-secondary)' }}>
                +
              </button>
            </div>
            <button
              onClick={() => addToCart(product.id, qty)}
              disabled={product.stock === 0}
              className="flex-1 rounded-xl py-3 text-sm font-semibold bg-[var(--clr-ink)] text-white hover:bg-[var(--clr-accent)] transition-colors duration-200 disabled:bg-[var(--clr-surface-2)] disabled:text-[var(--clr-text-disabled)]"
            >
              Add to cart
            </button>
            <button
              onClick={() => toggleWishlist(product.id)}
              aria-pressed={inWishlist}
              className={`px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${
                inWishlist
                  ? "border-[var(--clr-accent)] text-[var(--clr-accent)]"
                  : "border-[var(--clr-border)] text-[var(--clr-text-secondary)] hover:border-[var(--clr-border-strong)]"
              }`}
            >
              {inWishlist ? "Saved" : "Save"}
            </button>
          </div>

          <div className="mt-8 border-t border-[var(--clr-border)] pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: 'var(--clr-text-disabled)' }}>Specifications</h2>
            <dl className="mt-4 rounded-xl overflow-hidden border border-[var(--clr-border)]">
              {Object.entries(product.specs).map(([k, v], i) => (
                <div key={k} className="flex justify-between px-4 py-2.5 text-sm" style={{ background: i % 2 === 0 ? 'var(--clr-surface)' : 'var(--clr-surface-2)' }}>
                  <dt className="font-medium" style={{ color: 'var(--clr-text-secondary)' }}>{k}</dt>
                  <dd style={{ color: 'var(--clr-text-primary)' }}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {complements.length > 0 && (
        <div className="mt-14">
          <Section title="Complete your setup" subtitle="Frequently bought together">
            <ProductGrid products={complements} />
          </Section>
        </div>
      )}

      {similar.length > 0 && (
        <Section title="Similar products" subtitle="Comparable specs and price">
          <ProductGrid products={similar} />
        </Section>
      )}

      <section className="mt-12 max-w-3xl mx-auto">
        <h2 className="font-display text-2xl font-semibold" style={{ color: 'var(--clr-text-primary)' }}>Customer reviews</h2>
        <div className="mt-2 mb-6 flex items-center gap-3">
            <RatingStars rating={product.rating} count={product.reviewCount} />
            <span className="text-sm font-medium" style={{ color: 'var(--clr-text-secondary)' }}>{product.rating} out of 5</span>
        </div>
        <div className="mt-4 space-y-4">
          {reviews.length === 0 && <p className="text-sm text-zinc-500">No reviews yet.</p>}
          {reviews.map((r) => (
            <div key={r.id} className="rounded-2xl border border-[var(--clr-border)] p-5 bg-[var(--clr-surface)]">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--clr-accent-subtle)] text-[var(--clr-accent)] font-semibold text-sm">
                    {r.author.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--clr-text-primary)]">{r.author}</p>
                    <p className="text-xs text-[var(--clr-text-secondary)]">{r.date}</p>
                  </div>
                </div>
                <RatingStars rating={r.rating} />
              </div>
              <p className="mt-3 font-semibold text-sm" style={{ color: 'var(--clr-text-primary)' }}>{r.title}</p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--clr-text-secondary)' }}>{r.body}</p>
              {r.verified && (
                <div className="mt-3">
                  <span className="badge badge-success">Verified purchase</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {product.stock > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 p-4 bg-white/95 backdrop-blur border-t border-[var(--clr-border)] flex items-center justify-between gap-3 lg:hidden">
          <span className="text-lg font-bold" style={{ color: 'var(--clr-text-primary)' }}>{formatPrice(product.price)}</span>
          <button
            onClick={() => addToCart(product.id, 1)}
            className="rounded-xl px-6 py-2.5 text-sm font-semibold bg-[var(--clr-accent)] text-white hover:bg-[var(--clr-accent-hover)] transition-colors duration-200"
          >
            Add to cart
          </button>
        </div>
      )}
    </div>
  );
}

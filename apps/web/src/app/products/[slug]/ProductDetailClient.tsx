"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  ProductDetail,
  ProductListItem,
  ProductVariant,
} from "@ai-commerce/types";
import { formatPrice } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useRecommendations } from "@/lib/hooks/useRecommendations";
import { fromProductListItem } from "@/lib/catalog-mappers";
import CatalogProductGrid from "@/components/catalog/CatalogProductGrid";
import VariantPicker from "@/components/catalog/VariantPicker";
import ProductReviews from "@/components/product/ProductReviews";

export default function ProductDetailClient({
  initialProduct,
  initialSimilarProducts,
}: {
  initialProduct: ProductDetail;
  initialSimilarProducts: ProductListItem[];
}) {
  const product = initialProduct;
  const router = useRouter();
  const authStatus = useStore((s) => s.authStatus);
  const userId = useStore((s) => s.user?.id ?? null);
  const addServerCartItem = useStore((s) => s.addServerCartItem);
  const trackRealEvent = useStore((s) => s.trackRealEvent);
  const inWishlist = useStore(
    (s) => s.serverWishlist?.items.some((i) => i.productId === product.id) ?? false,
  );
  const toggleWishlist = useStore((s) => s.toggleServerWishlistItem);

  useEffect(() => {
    trackRealEvent("PRODUCT_VIEWED", product.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  const similar = useRecommendations("similar", { productId: product.id, limit: 6 });
  const frequentlyBoughtWith = useRecommendations("frequentlyBoughtWith", { productId: product.id, limit: 3 });
  const frequentlyBoughtWithReasons = useMemo(
    () => Object.fromEntries((frequentlyBoughtWith ?? []).map((r) => [r.product.id, r.reasons[0]])),
    [frequentlyBoughtWith],
  );
  const similarReasons = useMemo(
    () => Object.fromEntries((similar ?? []).map((r) => [r.product.id, r.reasons[0]])),
    [similar],
  );
  const similarProducts =
    similar && similar.length > 0
      ? similar.map((r) => r.product)
      : initialSimilarProducts;

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [wishlistPending, setWishlistPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const images = product.images;

  const priceLabel = selectedVariant
    ? formatPrice(selectedVariant.price)
    : product.minPrice != null
      ? product.minPrice !== product.maxPrice
        ? `From ${formatPrice(product.minPrice)}`
        : formatPrice(product.minPrice)
      : null;

  const compareAtPrice = selectedVariant?.compareAtPrice ?? null;
  const savings = compareAtPrice && selectedVariant ? compareAtPrice - selectedVariant.price : 0;
  const inStock = selectedVariant ? selectedVariant.availableQuantity > 0 : product.inStock;
  const authLoading = authStatus === "idle" || authStatus === "checking";

  const requireAuth = useCallback(
    (redirectTo: string) => {
      router.push(`/login?redirect=${encodeURIComponent(redirectTo)}`);
    },
    [router],
  );

  const handleAddToCart = useCallback(async () => {
    setError(null);
    if (authStatus === "unauthenticated") {
      requireAuth(`/products/${product.slug}`);
      return;
    }
    if (authStatus !== "authenticated") return;
    if (!selectedVariant) return;
    const requestUserId = userId;
    setAdding(true);
    try {
      await addServerCartItem(selectedVariant.id, qty);
      if (
        useStore.getState().user?.id !== requestUserId ||
        useStore.getState().authStatus !== "authenticated"
      ) {
        return;
      }
      setAdded(true);
      setTimeout(() => setAdded(false), 1400);
    } catch (err) {
      // authStatus is read fresh here, not from the closure — a session that looked
      // "checking"/"idle" at click time (e.g. right after a hard navigation, before
      // SessionProvider's silent refresh resolves) may have since settled either way.
      // The request itself already retried once after a silent refresh (see
      // packages/api-client's 401 handling) — a confirmed-unauthenticated result at this
      // point means there really is no session, not just one that hadn't loaded yet.
      if (useStore.getState().authStatus === "unauthenticated") {
        requireAuth(`/products/${product.slug}`);
        return;
      }
      if (useStore.getState().user?.id !== requestUserId) return;
      setError(err instanceof Error ? err.message : "Couldn't add this to your cart.");
    } finally {
      setAdding(false);
    }
  }, [authStatus, userId, selectedVariant, qty, addServerCartItem, product.slug, requireAuth]);

  const handleWishlist = useCallback(async () => {
    if (authStatus === "unauthenticated") {
      requireAuth(`/products/${product.slug}`);
      return;
    }
    if (authStatus !== "authenticated") return;
    setWishlistPending(true);
    try {
      await toggleWishlist(product.id);
    } catch {
      if (useStore.getState().authStatus === "unauthenticated") {
        requireAuth(`/products/${product.slug}`);
      }
    } finally {
      setWishlistPending(false);
    }
  }, [authStatus, product.id, product.slug, requireAuth, toggleWishlist]);

  const specGroups = useMemo(() => {
    const groups = new Map<string, typeof product.specifications>();
    for (const spec of [...product.specifications].sort((a, b) => a.sortOrder - b.sortOrder)) {
      if (!groups.has(spec.group)) groups.set(spec.group, []);
      groups.get(spec.group)!.push(spec);
    }
    return groups;
  }, [product]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="text-xs mb-6" style={{ color: "var(--clr-text-secondary)" }}>
        <Link href="/" className="hover:underline">Home</Link> ›{" "}
        <Link href={`/category/${product.category.slug}`} className="hover:underline">
          {product.category.name}
        </Link>{" "}
        › {product.name}
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-stone-50 shadow-sm">
            {images.length > 0 ? (
              <Image
                src={images[activeImage]?.url ?? images[0].url}
                alt={product.name}
                fill
                className="object-cover"
                priority
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--clr-text-disabled)]">
                No image available
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="mt-3 flex gap-2">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  aria-label={`Show image ${i + 1} of ${images.length}`}
                  aria-pressed={activeImage === i}
                  className={`relative h-16 w-16 rounded-xl overflow-hidden ring-2 transition-all ${
                    activeImage === i
                      ? "ring-[var(--clr-accent)]"
                      : "ring-transparent hover:ring-[var(--clr-border-strong)]"
                  }`}
                >
                  <Image
                    src={img.url}
                    alt={img.altText ?? `${product.name} thumbnail ${i + 1}`}
                    fill
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          {product.brand && (
            <p
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--clr-text-disabled)" }}
            >
              {product.brand.name}
            </p>
          )}
          <h1
            className="mt-1 font-display text-3xl font-semibold leading-tight"
            style={{ color: "var(--clr-text-primary)" }}
          >
            {product.name}
          </h1>

          <div className="mt-4 h-px bg-[var(--clr-border)]" />

          <div className="mt-4 flex flex-wrap items-baseline gap-3">
            {priceLabel && (
              <span className="text-3xl font-bold" style={{ color: "var(--clr-text-primary)" }}>
                {priceLabel}
              </span>
            )}
            {compareAtPrice && selectedVariant && (
              <span className="text-base text-[var(--clr-text-disabled)] line-through">
                {formatPrice(compareAtPrice)}
              </span>
            )}
            {savings > 0 && <span className="badge badge-success">Save {formatPrice(savings)}</span>}
          </div>

          <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--clr-text-secondary)" }}>
            {product.description}
          </p>

          {product.variants.length > 0 && (
            <div className="mt-6">
              <VariantPicker variants={product.variants} onSelect={setSelectedVariant} />
            </div>
          )}

          <p className="mt-4 flex items-center gap-2 text-sm font-medium">
            {inStock ? (
              <>
                <span className="h-2 w-2 rounded-full bg-[var(--clr-success)]" />
                <span style={{ color: "var(--clr-text-primary)" }}>In stock</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-[var(--clr-error)]" />
                <span style={{ color: "var(--clr-error)" }}>Out of stock</span>
              </>
            )}
          </p>

          {error && (
            <p role="alert" className="mt-2 text-sm" style={{ color: "var(--clr-error, #dc2626)" }}>
              {error}
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <div className="flex items-center rounded-xl border" style={{ borderColor: "var(--clr-border)" }}>
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="px-3 py-2.5 text-lg font-medium hover:bg-stone-50 transition-colors"
                style={{ color: "var(--clr-text-secondary)" }}
              >
                −
              </button>
              <span
                className="w-10 text-center text-sm font-semibold"
                style={{ color: "var(--clr-text-primary)" }}
                aria-live="polite"
              >
                {qty}
              </span>
              <button
                onClick={() => setQty((q) => q + 1)}
                aria-label="Increase quantity"
                className="px-3 py-2.5 text-lg font-medium hover:bg-stone-50 transition-colors"
                style={{ color: "var(--clr-text-secondary)" }}
              >
                +
              </button>
            </div>
            <button
              onClick={handleAddToCart}
              disabled={!inStock || !selectedVariant || adding || authLoading}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold transition-colors duration-200 disabled:bg-[var(--clr-surface-2)] disabled:text-[var(--clr-text-disabled)] ${
                added
                  ? "bg-[var(--clr-success-text)] text-white"
                  : "bg-[var(--clr-ink)] text-white hover:bg-[var(--clr-accent)]"
              }`}
            >
              {!inStock ? "Unavailable" : added ? "✓ Added to cart" : adding ? "Adding…" : "Add to cart"}
            </button>
            <button
              onClick={handleWishlist}
              disabled={wishlistPending || authLoading}
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

          {specGroups.size > 0 && (
            <div className="mt-8 border-t border-[var(--clr-border)] pt-6">
              <h2
                className="text-sm font-semibold uppercase tracking-widest"
                style={{ color: "var(--clr-text-disabled)" }}
              >
                Specifications
              </h2>
              {[...specGroups.entries()].map(([group, specs]) => (
                <div key={group} className="mt-4">
                  {specGroups.size > 1 && (
                    <p className="text-xs font-semibold mb-2" style={{ color: "var(--clr-text-secondary)" }}>
                      {group}
                    </p>
                  )}
                  <dl className="rounded-xl overflow-hidden border border-[var(--clr-border)]">
                    {specs.map((spec, i) => (
                      <div
                        key={spec.id}
                        className="flex justify-between px-4 py-2.5 text-sm"
                        style={{ background: i % 2 === 0 ? "var(--clr-surface)" : "var(--clr-surface-2)" }}
                      >
                        <dt className="font-medium" style={{ color: "var(--clr-text-secondary)" }}>
                          {spec.key}
                        </dt>
                        <dd style={{ color: "var(--clr-text-primary)" }}>{spec.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ProductReviews
        productSlug={product.slug}
        summary={{ average: product.rating, count: product.reviewCount }}
      />

      {frequentlyBoughtWith && frequentlyBoughtWith.length > 0 && (
        <div className="mt-12">
          <h2 className="font-display text-xl font-semibold mb-4" style={{ color: "var(--clr-text-primary)" }}>
            Frequently bought together
          </h2>
          <CatalogProductGrid
            products={frequentlyBoughtWith.map((r) => fromProductListItem(r.product))}
            reasons={frequentlyBoughtWithReasons}
          />
        </div>
      )}

      {similarProducts.length > 0 && (
        <div className="mt-12">
          <h2 className="font-display text-xl font-semibold mb-4" style={{ color: "var(--clr-text-primary)" }}>
            Similar products
          </h2>
          <CatalogProductGrid products={similarProducts.map(fromProductListItem)} reasons={similarReasons} />
        </div>
      )}

      {inStock && (
        <div className="fixed bottom-0 inset-x-0 z-30 p-4 bg-white/95 backdrop-blur border-t border-[var(--clr-border)] flex items-center justify-between gap-3 lg:hidden">
          {priceLabel && (
            <span className="text-lg font-bold" style={{ color: "var(--clr-text-primary)" }}>
              {priceLabel}
            </span>
          )}
          <button
            onClick={handleAddToCart}
            disabled={!selectedVariant || adding || authLoading}
            className="rounded-xl px-6 py-2.5 text-sm font-semibold bg-[var(--clr-accent)] text-white hover:bg-[var(--clr-accent-hover)] transition-colors duration-200 disabled:opacity-60"
          >
            {added ? "✓ Added" : "Add to cart"}
          </button>
        </div>
      )}
    </div>
  );
}

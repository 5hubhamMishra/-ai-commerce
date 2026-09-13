"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/format";
import { useStore } from "@/lib/store";

/** Normalized shape the real-catalog card renders — shop/category/search results
 *  (ProductListItem/SearchResultItem) and wishlist entries (WishlistItemResponse) all map
 *  into this via lib/catalog-mappers.ts, so one card component serves all three without
 *  needing to know their differing wire shapes. */
export type CatalogCardProduct = {
  id: string;
  slug: string;
  name: string;
  brandName: string | null;
  imageUrl: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  available: boolean;
};

export default function CatalogProductCard({
  product,
  reason,
}: {
  product: CatalogCardProduct;
  /** A short "why this" string from a recommendation source — rendered as a small badge,
   *  same treatment as the legacy ProductCard's own `reason` prop. */
  reason?: string;
}) {
  const router = useRouter();
  const authStatus = useStore((s) => s.authStatus);
  const inWishlist = useStore(
    (s) =>
      s.serverWishlist?.items.some((i) => i.productId === product.id) ?? false,
  );
  const toggleWishlist = useStore((s) => s.toggleServerWishlistItem);
  const trackRealEvent = useStore((s) => s.trackRealEvent);
  const [heartAnimating, setHeartAnimating] = useState(false);
  const [pending, setPending] = useState(false);

  const handleWishlist = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      if (authStatus === "unauthenticated") {
        router.push(
          `/login?redirect=${encodeURIComponent(`/products/${product.slug}`)}`,
        );
        return;
      }
      setHeartAnimating(true);
      setPending(true);
      try {
        await toggleWishlist(product.id);
      } catch {
        // See ProductDetailClient's handleAddToCart for why this is checked post-hoc
        // rather than gated up front: a session still "checking" right after a hard
        // navigation gets one real chance (with a silent-refresh retry) before being
        // treated as a guest.
        if (useStore.getState().authStatus === "unauthenticated") {
          router.push(
            `/login?redirect=${encodeURIComponent(`/products/${product.slug}`)}`,
          );
        }
      } finally {
        setPending(false);
        setTimeout(() => setHeartAnimating(false), 380);
      }
    },
    [authStatus, product.id, product.slug, router, toggleWishlist],
  );

  const priceLabel =
    product.minPrice == null
      ? null
      : product.minPrice !== product.maxPrice
        ? `From ${formatPrice(product.minPrice)}`
        : formatPrice(product.minPrice);

  return (
    <div
      data-testid="catalog-product-card"
      data-available={product.available ? "true" : "false"}
      className="catalog-product-card group"
    >
      <button
        onClick={handleWishlist}
        disabled={pending || authStatus === "idle" || authStatus === "checking"}
        className="catalog-wishlist"
        aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          style={{
            animation: heartAnimating
              ? "heartPop 0.38s ease forwards"
              : undefined,
            fill: inWishlist ? "var(--clr-accent)" : "none",
            stroke: inWishlist ? "var(--clr-accent)" : "currentColor",
            strokeWidth: 2,
          }}
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>

      <Link
        href={`/products/${product.slug}`}
        className="catalog-card-link"
        onClick={() => {
          trackRealEvent("PRODUCT_CLICKED", product.id);
          if (reason) trackRealEvent("RECOMMENDATION_CLICKED", product.id);
        }}
      >
        <div className="catalog-card-media">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              unoptimized={/^\/products\/[\w-]+\.svg$/.test(product.imageUrl)}
              alt={product.name}
              fill
              className="catalog-card-image"
            />
          ) : (
            <div className="catalog-card-empty">
              No image
            </div>
          )}
          {!product.available && (
            <div className="catalog-card-unavailable">
              <span className="catalog-card-stock">
                Out of Stock
              </span>
            </div>
          )}
        </div>

        <div className="catalog-card-body">
          {product.brandName && (
            <p className="catalog-card-brand">
              {product.brandName}
            </p>
          )}
          <h3 className="catalog-card-title">
            {product.name}
          </h3>
          {priceLabel && (
            <div className="catalog-card-price">
              <span className="catalog-card-price-label">{priceLabel}</span>
            </div>
          )}
        </div>
      </Link>

      {reason && (
        <div className="catalog-card-reason">
          <div className="catalog-card-reason-badge">
            <svg
              viewBox="0 0 24 24"
              width="10"
              height="10"
              fill="var(--clr-accent)"
              className="flex-shrink-0"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span className="catalog-card-reason-text">
              {reason}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

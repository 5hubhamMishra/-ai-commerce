"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import type { ProductReview, ProductReviewSummary } from "@ai-commerce/types";
import { reviewsApi } from "@ai-commerce/api-client";
import StarRating from "@/components/StarRating";

const PAGE_SIZE = 10;

function formatReviewDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export default function ProductReviews({
  productSlug,
  summary,
}: {
  productSlug: string;
  summary: ProductReviewSummary;
}) {
  const [reviews, setReviews] = useState<ProductReview[] | null>(null);
  const [total, setTotal] = useState(summary.count);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    const version = ++requestVersion.current;
    let cancelled = false;
    startTransition(() => {
      setReviews(summary.count === 0 ? [] : null);
      setTotal(summary.count);
      setPage(1);
      setLoadingMore(false);
      setError(null);
    });
    if (summary.count === 0) {
      return;
    }
    reviewsApi
      .listForProduct(productSlug, { page: 1, pageSize: PAGE_SIZE })
      .then((res) => {
        if (cancelled || version !== requestVersion.current) return;
        setReviews(res.items);
        setTotal(res.total);
      })
      .catch(() => {
        if (!cancelled && version === requestVersion.current) setError("Couldn't load reviews.");
      });
    return () => {
      cancelled = true;
    };
  }, [productSlug, summary.count]);

  async function loadMore() {
    const version = requestVersion.current;
    setLoadingMore(true);
    setError(null);
    try {
      const nextPage = page + 1;
      const res = await reviewsApi.listForProduct(productSlug, { page: nextPage, pageSize: PAGE_SIZE });
      if (version !== requestVersion.current) return;
      setReviews((prev) => [...(prev ?? []), ...res.items]);
      setPage(nextPage);
    } catch {
      setError("Couldn't load more reviews.");
    } finally {
      if (version === requestVersion.current) setLoadingMore(false);
    }
  }

  if (summary.count === 0) {
    return (
      <div className="mt-12 border-t pt-8" style={{ borderColor: "var(--clr-border)" }}>
        <h2 className="font-display text-xl font-semibold" style={{ color: "var(--clr-text-primary)" }}>
          Reviews
        </h2>
        <p className="mt-3 text-sm" style={{ color: "var(--clr-text-secondary)" }}>
          No reviews yet. Reviews appear here once a delivered order includes this product.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-12 border-t pt-8" style={{ borderColor: "var(--clr-border)" }}>
      <div className="flex items-center gap-3">
        <h2 className="font-display text-xl font-semibold" style={{ color: "var(--clr-text-primary)" }}>
          Reviews
        </h2>
        {summary.average != null && (
          <div className="flex items-center gap-1.5">
            <StarRating value={summary.average} />
            <span className="text-sm font-semibold" style={{ color: "var(--clr-text-primary)" }}>
              {summary.average.toFixed(1)}
            </span>
            <span className="text-sm" style={{ color: "var(--clr-text-secondary)" }}>
              ({summary.count} {summary.count === 1 ? "review" : "reviews"})
            </span>
          </div>
        )}
      </div>

      {!reviews && (
        <div className="mt-6 space-y-4" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: "var(--clr-surface-2)" }} />
          ))}
        </div>
      )}

      {reviews && (
        <ul className="mt-6 space-y-6">
          {reviews.map((review) => (
            <li key={review.id} className="border-b pb-6 last:border-0" style={{ borderColor: "var(--clr-border)" }}>
              <div className="flex items-center gap-2">
                <StarRating value={review.rating} />
                {review.verifiedPurchase && (
                  <span className="text-[11px] font-semibold" style={{ color: "var(--clr-success-text)" }}>
                    Verified purchase
                  </span>
                )}
              </div>
              {review.title && (
                <p className="mt-2 text-sm font-semibold" style={{ color: "var(--clr-text-primary)" }}>
                  {review.title}
                </p>
              )}
              {review.body && (
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--clr-text-secondary)" }}>
                  {review.body}
                </p>
              )}
              <p className="mt-2 text-xs" style={{ color: "var(--clr-text-disabled)" }}>
                {review.authorName} · {formatReviewDate(review.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm" style={{ color: "var(--clr-error, #dc2626)" }}>
          {error}
        </p>
      )}

      {reviews && reviews.length < total && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mt-5 text-sm font-medium transition-colors disabled:opacity-60"
          style={{ color: "var(--clr-accent)" }}
        >
          {loadingMore ? "Loading…" : `Show more reviews`}
        </button>
      )}
    </div>
  );
}

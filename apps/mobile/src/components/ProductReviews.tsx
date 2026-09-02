import { startTransition, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ProductReview, ProductReviewSummary } from '@ai-commerce/types';
import { reviewsApi } from '@ai-commerce/api-client';
import StarRating from './StarRating';

const PAGE_SIZE = 10;

function formatReviewDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Ported from apps/web's ProductReviews.tsx — same fetch/paginate contract, RN shell. */
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
      <View style={styles.section}>
        <Text style={styles.heading}>Reviews</Text>
        <Text style={styles.emptyText}>No reviews yet. Reviews appear here once a delivered order includes this product.</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Reviews</Text>
        {summary.average != null && (
          <View style={styles.summaryRow}>
            <StarRating value={summary.average} />
            <Text style={styles.summaryAverage}>{summary.average.toFixed(1)}</Text>
            <Text style={styles.summaryCount}>
              ({summary.count} {summary.count === 1 ? 'review' : 'reviews'})
            </Text>
          </View>
        )}
      </View>

      {!reviews && <ActivityIndicator style={styles.spinner} />}

      {reviews?.map((review) => (
        <View key={review.id} style={styles.reviewRow}>
          <View style={styles.reviewHeader}>
            <StarRating value={review.rating} />
            {review.verifiedPurchase && <Text style={styles.verifiedText}>Verified purchase</Text>}
          </View>
          {review.title && <Text style={styles.reviewTitle}>{review.title}</Text>}
          {review.body && <Text style={styles.reviewBody}>{review.body}</Text>}
          <Text style={styles.reviewMeta}>
            {review.authorName} · {formatReviewDate(review.createdAt)}
          </Text>
        </View>
      ))}

      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}

      {reviews && reviews.length < total && (
        <Pressable
          onPress={() => void loadMore()}
          disabled={loadingMore}
          accessibilityRole="button"
          accessibilityLabel="Show more reviews"
        >
          <Text style={styles.loadMoreText}>{loadingMore ? 'Loading…' : 'Show more reviews'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 28, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 16 },
  heading: { fontSize: 18, fontWeight: '700', color: '#111827' },
  emptyText: { fontSize: 13, color: '#6b7280', marginTop: 8 },
  headerRow: { gap: 8 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  summaryAverage: { fontSize: 13, fontWeight: '700', color: '#111827' },
  summaryCount: { fontSize: 13, color: '#6b7280' },
  spinner: { marginTop: 16 },
  reviewRow: { marginTop: 18, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  verifiedText: { fontSize: 11, fontWeight: '700', color: '#16a34a' },
  reviewTitle: { fontSize: 13, fontWeight: '700', color: '#111827', marginTop: 8 },
  reviewBody: { fontSize: 13, color: '#4b5563', lineHeight: 19, marginTop: 4 },
  reviewMeta: { fontSize: 11, color: '#9ca3af', marginTop: 8 },
  errorText: { color: '#dc2626', marginTop: 10, fontSize: 13 },
  loadMoreText: { marginTop: 16, fontSize: 13, fontWeight: '600', color: '#b45309' },
});

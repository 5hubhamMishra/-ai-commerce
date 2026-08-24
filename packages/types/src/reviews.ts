/** Matches `toReviewResponse()` in apps/api/src/products/product-reviews.service.ts.
 *  `verifiedPurchase` is always true today — the API only ever creates a review after
 *  confirming the order belonged to the reviewer, contained the product, and was
 *  delivered, so there's no unverified-review path to represent. */
export type ProductReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  authorName: string;
  verifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductReviewSummary = {
  average: number | null;
  count: number;
};

/** GET /products/:slug/reviews. */
export type ListProductReviewsResponse = {
  items: ProductReview[];
  total: number;
  page: number;
  pageSize: number;
  summary: ProductReviewSummary;
};

export type ListProductReviewsQuery = {
  page?: number;
  pageSize?: number;
};

/** Matches `CreateProductReviewDto`. `orderId` must be a delivered order that actually
 *  contained this product — the API re-checks all of that server-side regardless of what
 *  the client sends. */
export type CreateProductReviewInput = {
  orderId: string;
  rating: number;
  title?: string;
  body?: string;
};

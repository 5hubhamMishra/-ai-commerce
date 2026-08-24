import type {
  CreateProductReviewInput,
  ListProductReviewsQuery,
  ListProductReviewsResponse,
  ProductReview,
} from '@ai-commerce/types';
import { request, toQueryString } from './http';

export const reviewsApi = {
  listForProduct: (slug: string, query: ListProductReviewsQuery = {}) =>
    request<ListProductReviewsResponse>(
      `/products/${encodeURIComponent(slug)}/reviews${toQueryString(query)}`,
    ),

  create: (slug: string, input: CreateProductReviewInput) =>
    request<ProductReview>(`/products/${encodeURIComponent(slug)}/reviews`, {
      method: 'POST',
      body: input,
    }),
};

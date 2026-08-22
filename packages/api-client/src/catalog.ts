import type {
  Brand,
  Category,
  ListProductsQuery,
  ListProductsResponse,
  ProductDetail,
} from '@ai-commerce/types';
import { request, toQueryString } from './http';

export const catalogApi = {
  listProducts: (query: ListProductsQuery = {}) =>
    request<ListProductsResponse>(`/products${toQueryString(query)}`),

  getProductBySlug: (slug: string) =>
    request<ProductDetail>(`/products/${encodeURIComponent(slug)}`),

  listProductTags: () =>
    request<{ id: string; name: string; slug: string }[]>('/products/tags'),

  /** Returns the active category tree (root nodes with nested `children`). */
  listCategories: () => request<Category[]>('/categories'),

  getCategoryBySlug: (slug: string) =>
    request<Category>(`/categories/${encodeURIComponent(slug)}`),

  listCategoryProducts: (slug: string, query: ListProductsQuery = {}) =>
    request<ListProductsResponse>(
      `/categories/${encodeURIComponent(slug)}/products${toQueryString(query)}`,
    ),

  listBrands: () => request<Brand[]>('/brands'),

  listBrandProducts: (slug: string, query: ListProductsQuery = {}) =>
    request<ListProductsResponse>(
      `/brands/${encodeURIComponent(slug)}/products${toQueryString(query)}`,
    ),
};

import type { ProductDetail, ProductStatus, ListProductsResponse } from '@ai-commerce/types';
import { request, toQueryString } from './http';

export type SellerProfile = {
  businessName: string; slug: string; description: string | null;
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
  rejectReason?: string | null; suspendReason?: string | null;
};
export type SellerOverview = { total: number; published: number; drafts: number; archived: number; lowStock: number; outOfStock: number; orderCount: number; recentOrders: { id: string; status: string; createdAt: string }[] };
export type SellerProductInput = { name: string; description: string; categoryId: string; brandId?: string | null; status?: ProductStatus };
export type SellerOrderItem = { id: string; orderId: string; orderStatus: string; orderCreatedAt: string; productName: string; sku: string; unitPrice: number; quantity: number; lineTotal: number; currency: string };
export type SellerInventory = { quantityOnHand: number; quantityReserved: number; quantityCommitted: number };
const root = '/sellers/me';
export const sellersApi = {
  apply: (businessName: string, description: string) => request<SellerProfile>('/sellers/apply', { method: 'POST', body: { businessName, description } }),
  profile: () => request<SellerProfile>(root),
  updateProfile: (businessName: string, description: string) => request<SellerProfile>(root, { method: 'PATCH', body: { businessName, description } }),
  overview: () => request<SellerOverview>(`${root}/overview`),
  products: (query: { page?: number; search?: string; status?: ProductStatus } = {}) => request<ListProductsResponse>(`${root}/products${toQueryString(query)}`),
  product: (id: string) => request<ProductDetail>(`${root}/products/${encodeURIComponent(id)}`),
  create: (body: SellerProductInput) => request<ProductDetail>(`${root}/products`, { method: 'POST', body }),
  update: (id: string, body: Partial<SellerProductInput>) => request<ProductDetail>(`${root}/products/${id}`, { method: 'PATCH', body }),
  variant: (id: string, variantId: string | undefined, body: { sku: string; price: number; compareAtPrice?: number | null }) => request<ProductDetail>(`${root}/products/${id}/variants${variantId ? `/${variantId}` : ''}`, { method: variantId ? 'PATCH' : 'POST', body }),
  inventory: (variantId: string) => request<SellerInventory[]>(`${root}/inventory/variants/${variantId}`),
  stock: (variantId: string, quantityOnHand: number) => request<SellerInventory>(`${root}/inventory/variants/${variantId}`, { method: 'PUT', body: { quantityOnHand } }),
  upload: (id: string, file: File) => { const body = new FormData(); body.append('image', file); return request<ProductDetail>(`${root}/products/${id}/upload`, { method: 'POST', body }); },
  preview: (id: string, imageId: string) => request<{ dataUrl: string }>(`${root}/products/${id}/images/${imageId}/preview`),
  primary: (id: string, imageId: string) => request<ProductDetail>(`${root}/products/${id}/images/${imageId}`, { method: 'PATCH', body: { isPrimary: true } }),
  removeImage: (id: string, imageId: string) => request<ProductDetail>(`${root}/products/${id}/images/${imageId}`, { method: 'DELETE' }),
  specification: (id: string, body: { key: string; value: string }) => request<ProductDetail>(`${root}/products/${id}/specifications`, { method: 'POST', body }),
  removeSpecification: (id: string, specId: string) => request<ProductDetail>(`${root}/products/${id}/specifications/${specId}`, { method: 'DELETE' }),
  orders: (page = 1) => request<{ items: SellerOrderItem[]; total: number; page: number; pageSize: number }>(`${root}/orders?page=${page}`),
  publicProfile: (slug: string) => request<SellerProfile>(`/sellers/${encodeURIComponent(slug)}`),
  publicProducts: (slug: string, page = 1) => request<ListProductsResponse>(`/sellers/${encodeURIComponent(slug)}/products?page=${page}`),
};

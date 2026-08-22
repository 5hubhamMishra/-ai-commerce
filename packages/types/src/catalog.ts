/** Mirrors apps/api's `ProductStatus` enum (apps/api/prisma/schema.prisma). */
export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export type CategorySummary = {
  id: string;
  name: string;
  slug: string;
};

export type BrandSummary = {
  id: string;
  name: string;
  slug: string;
};

export type SellerSummary = {
  id: string;
  slug: string;
  businessName: string;
} | null;

/** Matches `toListItem()` in apps/api/src/products/products.service.ts. */
export type ProductListItem = {
  id: string;
  slug: string;
  name: string;
  status: ProductStatus;
  isFeatured: boolean;
  category: CategorySummary;
  brand: BrandSummary | null;
  seller: SellerSummary;
  currency: string;
  minPrice: number | null;
  maxPrice: number | null;
  primaryImageUrl: string | null;
  inStock: boolean;
};

export type ProductVariantAttribute = {
  attribute: string;
  attributeSlug: string;
  value: string;
  valueSlug: string;
};

/** Matches `mapVariant()` in apps/api/src/products/products.service.ts. */
export type ProductVariant = {
  id: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  weightGrams: number | null;
  isDefault: boolean;
  isActive: boolean;
  availableQuantity: number;
  attributes: ProductVariantAttribute[];
};

export type ProductImage = {
  id: string;
  url: string;
  altText: string | null;
  variantId: string | null;
  sortOrder: number;
  isPrimary: boolean;
};

export type ProductSpecification = {
  id: string;
  group: string;
  key: string;
  value: string;
  sortOrder: number;
};

/** Matches `toDetail()` in apps/api/src/products/products.service.ts — GET /products/:slug. */
export type ProductDetail = ProductListItem & {
  description: string;
  createdAt: string;
  updatedAt: string;
  variants: ProductVariant[];
  images: ProductImage[];
  specifications: ProductSpecification[];
  tags: string[];
};

export type ListProductsResponse = {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/** Matches PRODUCT_SORT_OPTIONS in apps/api/src/products/dto/list-products-query.dto.ts. */
export type ProductSort = 'newest' | 'name_asc' | 'featured';

export type ListProductsQuery = {
  page?: number;
  pageSize?: number;
  category?: string;
  brand?: string;
  tag?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  featured?: boolean;
  sort?: ProductSort;
};

/** Matches the `categories` Prisma model. GET /categories returns a tree (root nodes with
 *  nested `children`); GET /categories/:slug returns one node with its direct children. */
export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  returnWindowDays: number | null;
  createdAt: string;
  updatedAt: string;
  children: Category[];
};

/** Matches the `brands` Prisma model. GET /brands returns a flat, active-only list. */
export type Brand = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

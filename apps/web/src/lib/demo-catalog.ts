import type {
  Brand,
  Category,
  ListProductsQuery,
  ListProductsResponse,
  ProductDetail,
  ProductListItem,
} from "@ai-commerce/types";
import productsRaw from "./data/presentation-products.json";

type RawProduct = {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  compareAtPrice?: number;
  rating: number;
  reviewCount: number;
  description: string;
  specs: Record<string, string>;
  tags: string[];
  images: string[];
  stock: number;
  featured?: boolean;
};

const rawProducts = productsRaw as unknown as RawProduct[];
const now = "2026-08-25T00:00:00.000Z";
export function shouldUseDemoCatalog(
  nodeEnv = process.env.NODE_ENV,
  allowFallback = process.env.NEXT_PUBLIC_ALLOW_DEMO_FALLBACK,
): boolean {
  return nodeEnv !== "production" || allowFallback === "true";
}

const demoCatalogEnabled = shouldUseDemoCatalog();

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function productSlug(product: RawProduct): string {
  return `${slugify(product.name)}-${product.id}`;
}

const categoryNames = Array.from(new Set(rawProducts.map((p) => p.category)));
const brandNames = Array.from(new Set(rawProducts.map((p) => p.brand)));

export const demoCategories: Category[] = demoCatalogEnabled
  ? categoryNames.map((name, index) => ({
      id: `demo-category-${slugify(name)}`,
      name,
      slug: slugify(name),
      description: `Shop ${name} at Veloura.`,
      imageUrl: null,
      parentId: null,
      sortOrder: index,
      isActive: true,
      returnWindowDays: null,
      createdAt: now,
      updatedAt: now,
      children: [],
    }))
  : [];

export const demoBrands: Brand[] = demoCatalogEnabled
  ? brandNames.map((name) => ({
      id: `demo-brand-${slugify(name)}`,
      name,
      slug: slugify(name),
      description: null,
      logoUrl: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }))
  : [];

const categoriesByName = new Map(demoCategories.map((c) => [c.name, c]));
const brandsByName = new Map(demoBrands.map((b) => [b.name, b]));

function toListItem(product: RawProduct): ProductListItem {
  const category = categoriesByName.get(product.category)!;
  const brand = brandsByName.get(product.brand)!;
  return {
    id: product.id,
    slug: productSlug(product),
    name: product.name,
    status: "ACTIVE",
    isFeatured: product.featured ?? false,
    category: { id: category.id, name: category.name, slug: category.slug },
    brand: { id: brand.id, name: brand.name, slug: brand.slug },
    seller: null,
    currency: "INR",
    minPrice: product.price,
    maxPrice: product.price,
    primaryImageUrl: product.images[0] ?? null,
    inStock: product.stock > 0,
    rating: product.rating,
    reviewCount: product.reviewCount,
  };
}

export function listDemoProducts(
  query: ListProductsQuery = {},
): ListProductsResponse {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  if (!demoCatalogEnabled) return { items: [], total: 0, page, pageSize };
  const search = query.search?.trim().toLowerCase();

  let items = rawProducts.filter((product) => {
    const category = categoriesByName.get(product.category);
    const brand = brandsByName.get(product.brand);
    if (query.featured && !product.featured) return false;
    if (query.category && category?.slug !== query.category) return false;
    if (query.brand && brand?.slug !== query.brand) return false;
    if (query.maxPrice !== undefined && product.price > query.maxPrice) {
      return false;
    }
    if (search) {
      const haystack = [
        product.name,
        product.brand,
        product.category,
        product.description,
        ...product.tags,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  if (query.sort === "name_asc") {
    items = [...items].sort((a, b) => a.name.localeCompare(b.name));
  } else if (query.sort === "featured") {
    items = [...items].sort(
      (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)),
    );
  }

  const total = items.length;
  const paged = items.slice((page - 1) * pageSize, page * pageSize);

  return {
    items: paged.map(toListItem),
    total,
    page,
    pageSize,
  };
}

export function mergeDemoProducts(
  response: ListProductsResponse,
  query: ListProductsQuery = {},
): ListProductsResponse {
  // Only pads a genuinely empty page (the real backend has too few matching
  // products to fill it) - a page that's already full of real results has no
  // gap to fill. Demo entries carry the raw seed id, not a real database
  // UUID, as their `id` (see toListItem below) - real backend items only, so
  // any interactive action (wishlist, cart) always targets a real record.
  // Without this check, a demo product "missing" only because it landed on a
  // later real page (not actually missing from the catalog) would get
  // prepended and push a real item off this page instead.
  if (response.items.length >= response.pageSize || response.page !== 1) {
    return response;
  }

  const demo = listDemoProducts({
    ...query,
    page: 1,
    pageSize: 100,
  }).items.filter(
    (product) => !response.items.some((item) => item.slug === product.slug),
  );

  if (demo.length === 0) return response;

  const items = [...response.items, ...demo].slice(0, response.pageSize);

  return {
    ...response,
    items,
    total: response.total + demo.length,
  };
}

export function getDemoCategoryBySlug(slug: string): Category | null {
  if (!demoCatalogEnabled) return null;
  return demoCategories.find((category) => category.slug === slug) ?? null;
}

export function getDemoProductBySlug(slug: string): ProductDetail | null {
  if (!demoCatalogEnabled) return null;
  const product = rawProducts.find(
    (candidate) => productSlug(candidate) === slug,
  );
  return product ? toDetail(product) : null;
}

export function getDemoProductById(id: string): ProductDetail | null {
  if (!demoCatalogEnabled) return null;
  const product = rawProducts.find((candidate) => candidate.id === id);
  return product ? toDetail(product) : null;
}

function toDetail(product: RawProduct): ProductDetail {
  const listItem = toListItem(product);
  return {
    ...listItem,
    description: product.description,
    createdAt: now,
    updatedAt: now,
    variants: [
      {
        id: `demo-variant-${product.id}`,
        sku: `SKU-${product.id.toUpperCase()}`,
        price: product.price,
        compareAtPrice: product.compareAtPrice ?? null,
        currency: "INR",
        weightGrams: null,
        isDefault: true,
        isActive: true,
        availableQuantity: product.stock,
        attributes: [
          {
            attribute: "Color",
            attributeSlug: "color",
            value: "Graphite",
            valueSlug: "graphite",
          },
        ],
      },
    ],
    images: product.images.map((url, sortOrder) => ({
      id: `demo-image-${product.id}-${sortOrder}`,
      url,
      altText: product.name,
      variantId: null,
      sortOrder,
      isPrimary: sortOrder === 0,
    })),
    specifications: Object.entries(product.specs).map(
      ([key, value], sortOrder) => ({
        id: `demo-spec-${product.id}-${sortOrder}`,
        group: "General",
        key,
        value,
        sortOrder,
      }),
    ),
    tags: product.tags,
  };
}

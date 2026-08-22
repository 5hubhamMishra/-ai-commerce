import type { ProductListItem, SearchResultItem, WishlistItemResponse } from "@ai-commerce/types";
import type { CatalogCardProduct } from "@/components/catalog/CatalogProductCard";

export function fromProductListItem(p: ProductListItem): CatalogCardProduct {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brandName: p.brand?.name ?? null,
    imageUrl: p.primaryImageUrl,
    minPrice: p.minPrice,
    maxPrice: p.maxPrice,
    available: p.inStock,
  };
}

export function fromSearchResultItem(p: SearchResultItem): CatalogCardProduct {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brandName: p.brand?.name ?? null,
    imageUrl: p.primaryImageUrl,
    minPrice: p.minPrice,
    maxPrice: p.maxPrice,
    available: p.inStock,
  };
}

export function fromWishlistItem(p: WishlistItemResponse): CatalogCardProduct {
  return {
    id: p.productId,
    slug: p.slug,
    name: p.name,
    brandName: p.brand,
    imageUrl: p.imageUrl,
    minPrice: p.minPrice,
    maxPrice: p.maxPrice,
    available: p.isAvailable,
  };
}

import type { ProductListItem } from "@ai-commerce/types";
import { catalogApi, recommendationsApi } from "@ai-commerce/api-client";
import { listDemoProducts } from "@/lib/demo-catalog";
import RecommendationsPageClient from "./RecommendationsPageClient";

const LIMIT = 24;

async function loadCatalogIndex() {
  const index = new Map<string, ProductListItem>();
  const first = await catalogApi.listProducts({ page: 1, pageSize: 100 });
  for (const product of first.items) index.set(product.id, product);

  // Remaining pages don't depend on each other - only their count (known once page 1 responds)
  // - so fetch them all at once instead of awaiting one round trip per page. Harmless today at
  // ~112 products (1 extra page), but scales badly as a sequential loop once the catalog grows.
  const totalPages = Math.max(1, Math.ceil(first.total / first.pageSize));
  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      catalogApi.listProducts({ page: i + 2, pageSize: 100 }),
    ),
  );
  for (const result of remainingPages) {
    for (const product of result.items) index.set(product.id, product);
  }

  for (const product of listDemoProducts({ pageSize: 100 }).items) {
    index.set(product.id, product);
  }

  return index;
}

async function fetchInitialRecommendations() {
  try {
    const [scored, index] = await Promise.all([
      recommendationsApi.list({ limit: LIMIT }),
      loadCatalogIndex(),
    ]);
    const products = scored
      .map((item) => index.get(item.productId))
      .filter((product): product is ProductListItem => Boolean(product));
    if (products.length > 0) return products;
  } catch {
  }

  return listDemoProducts({ pageSize: LIMIT, sort: "featured" }).items;
}

export default async function RecommendationsPage() {
  const initialProducts = await fetchInitialRecommendations();
  return <RecommendationsPageClient initialProducts={initialProducts} />;
}

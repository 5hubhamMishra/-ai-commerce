import type { SearchResponse, SearchResultItem } from "@ai-commerce/types";
import { searchApi } from "@ai-commerce/api-client";
import { listDemoProducts } from "@/lib/demo-catalog";
import SearchPageClient from "./SearchPageClient";

const PAGE_SIZE = 24;

function demoSearch(query: string): SearchResponse {
  const result = listDemoProducts({ search: query, pageSize: PAGE_SIZE });
  return {
    ...result,
    items: result.items.map(
      ({
        id,
        slug,
        name,
        category,
        brand,
        currency,
        minPrice,
        maxPrice,
        primaryImageUrl,
        inStock,
      }) =>
        ({
          id,
          slug,
          name,
          category,
          brand,
          currency,
          minPrice,
          maxPrice,
          primaryImageUrl,
          inStock,
        }) satisfies SearchResultItem,
    ),
    understood: null,
  };
}

async function fetchInitialSearch(query: string) {
  if (!query) return null;

  try {
    return await searchApi.search({ q: query, pageSize: PAGE_SIZE });
  } catch {
    return demoSearch(query);
  }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const initialQuery = typeof q === "string" ? q.trim() : "";
  const initialResult = await fetchInitialSearch(initialQuery);

  return (
    <SearchPageClient
      key={initialQuery}
      initialQuery={initialQuery}
      initialResult={initialResult}
    />
  );
}

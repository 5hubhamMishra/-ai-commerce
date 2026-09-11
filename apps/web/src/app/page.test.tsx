// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listProducts: vi.fn(), listCategories: vi.fn(), list: vi.fn(), trending: vi.fn(),
}));
vi.mock("@ai-commerce/api-client", () => ({ catalogApi: api, recommendationsApi: api }));
vi.mock("@/lib/store", () => ({ useStore: (select: (state: object) => unknown) => select({
  hydrated: false, events: [], recentlyViewedReal: [], personalizationEnabled: false,
}) }));
vi.mock("@/lib/hooks/useRecommendations", () => ({ useRecommendations: () => null }));
vi.mock("@/lib/hooks/useProductIndex", () => ({ useProductIndex: () => null }));
vi.mock("@/components/catalog/CatalogProductGrid", () => ({
  default: ({ products }: { products: { name: string }[] }) => <div>{products.map((p) => p.name).join(", ")}</div>,
}));
import Home from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  api.listCategories.mockResolvedValue([]);
  api.listProducts.mockImplementation(async (query) => ({
    items: query.featured ? [] : [{
      id: query.page === 2 ? "second" : "first",
      name: query.page === 2 ? "Second page recommendation" : "First page recommendation",
      slug: "product", brand: null, primaryImageUrl: null, minPrice: 100, maxPrice: 100, inStock: true,
    }], total: 101, pageSize: 100,
  }));
  api.list.mockResolvedValue([{ productId: "second" }, { productId: "missing" }]);
  api.trending.mockResolvedValue([{ productId: "first" }]);
});

it("renders public recommendations from all catalog pages before hydration", async () => {
  const html = renderToStaticMarkup(await Home());
  expect(html).toContain("First page recommendation");
  expect(html).toContain("Second page recommendation");
  expect(api.listProducts).toHaveBeenCalledWith({ page: 2, pageSize: 100 });
  expect(api.list).toHaveBeenCalledWith({ limit: 10 });
});

it.each([
  ["list", "First page recommendation", "Second page recommendation"],
  ["trending", "Second page recommendation", "First page recommendation"],
] as const)("keeps the other recommendations server-visible when %s fails", async (failed, visible, missing) => {
  api[failed].mockRejectedValue(new Error("Unavailable"));
  const html = renderToStaticMarkup(await Home());
  expect(html).toContain("Discover products with less guesswork");
  expect(html).toContain("Veloura");
  expect(html).toContain(visible);
  expect(html).not.toContain(missing);
});

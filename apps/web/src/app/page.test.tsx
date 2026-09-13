// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";

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

it("retains recommendations from successful catalog pages when another page fails", async () => {
  const listProducts = api.listProducts.getMockImplementation()!;
  api.listProducts.mockImplementation(async (query) => {
    if (query.page === 2) throw new Error("Unavailable catalog page");
    const result = await listProducts(query);
    return {
      ...result, total: 201,
      items: query.page === 3 ? [{ ...result.items[0], id: "third", name: "Third page recommendation" }] : result.items,
    };
  });
  api.list.mockResolvedValue([{ productId: "second" }, { productId: "third" }]);
  const html = renderToStaticMarkup(await Home());
  expect(html).toContain("First page recommendation");
  expect(html).toContain("Third page recommendation");
  expect(html).not.toContain("Second page recommendation");
  expect(api.listProducts).toHaveBeenCalledWith({ page: 3, pageSize: 100 });
});

it("serves category SVGs directly without redundant size variants", async () => {
  api.listCategories.mockResolvedValue([{ name: "Headphones", slug: "headphones" }]);
  const html = renderToStaticMarkup(
    <ImageConfigContext.Provider value={{ ...imageConfigDefault, dangerouslyAllowSVG: true }}>
      {await Home()}
    </ImageConfigContext.Provider>,
  );
  expect(html.match(/src="\/products\/headphones\.svg"/g)).toHaveLength(2);
  expect(html.includes("srcSet=")).toBe(false);
  expect(html.match(/class="home-category-image"/g)).toHaveLength(2);
  expect(html.match(/loading="lazy" decoding="async"/g)).toHaveLength(2);
  expect(html).not.toContain('data-nimg="fill"');
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

it.each(["categories", "featured"] as const)("keeps successful catalog content server-visible when %s fails", async (failed) => {
  if (failed === "categories") {
    api.listCategories.mockRejectedValue(new Error("Unavailable"));
  } else {
    api.listCategories.mockResolvedValue([{ name: "Live category", slug: "live-category" }]);
  }
  const listProducts = api.listProducts.getMockImplementation()!;
  api.listProducts.mockImplementation(async (query) => {
    if (!query.featured) return listProducts(query);
    if (failed === "featured") throw new Error("Unavailable");
    return { items: [{ id: "featured", name: "Live featured product", slug: "live-featured",
      brand: null, primaryImageUrl: null, minPrice: 100, maxPrice: 100, inStock: true }],
      total: 1, pageSize: 10 };
  });
  const html = renderToStaticMarkup(await Home());
  expect(html.includes(failed === "categories" ? "Live featured product" : "Live category")).toBe(true);
  expect(html).toContain("First page recommendation");
  expect(html).toContain("Second page recommendation");
});

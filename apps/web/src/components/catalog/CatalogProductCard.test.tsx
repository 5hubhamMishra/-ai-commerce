import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import CatalogProductCard from "./CatalogProductCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/store", () => ({ useStore: () => "unauthenticated" }));

it.each([
  ["/products/headphones.svg", false],
  ["/products/headphones.png", true],
  ["https://www.apple.com/headphones.svg", true],
])("preserves the appropriate image delivery for %s", (imageUrl, optimized) => {
  const html = renderToStaticMarkup(
    <ImageConfigContext.Provider value={{
      ...imageConfigDefault, dangerouslyAllowSVG: true,
      remotePatterns: [{ protocol: "https", hostname: "www.apple.com" }],
    }}>
      <CatalogProductCard product={{
        id: "headphones", slug: "headphones", name: "Headphones",
        brandName: null, imageUrl, minPrice: 100, maxPrice: 100, available: true,
      }} />
    </ImageConfigContext.Provider>,
  );
  expect(html.includes("srcSet=")).toBe(optimized);
  if (!optimized) expect(html).toContain(`src="${imageUrl}"`);
  const container = document.createElement("div");
  container.innerHTML = html;
  expect(container.firstElementChild?.classList.contains("catalog-product-card")).toBe(true);
  expect(container.firstElementChild?.hasAttribute("style")).toBe(false);
});

it("keeps unavailable product details and recommendation guidance in server HTML", () => {
  const html = renderToStaticMarkup(<CatalogProductCard product={{
    id: "headphones", slug: "headphones", name: "Headphones", brandName: "Audio brand",
    imageUrl: null, minPrice: 100, maxPrice: 200, available: false,
  }} reason="Based on your browsing" />);
  const container = document.createElement("div");
  container.innerHTML = html;
  expect(container.querySelector('[data-available="false"]')).not.toBeNull();
  expect(container.querySelector('a')?.getAttribute("href")).toBe("/products/headphones");
  for (const text of ["Headphones", "Audio brand", "No image", "Out of Stock", "From", "Based on your browsing"]) {
    expect(container.textContent).toContain(text);
  }
  expect(container.querySelector('button')?.hasAttribute("aria-label")).toBe(true);
});

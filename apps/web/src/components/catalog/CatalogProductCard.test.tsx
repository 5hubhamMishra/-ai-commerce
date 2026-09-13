import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import CatalogProductCard from "./CatalogProductCard";
import { getImageProps } from "next/image";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/store", () => ({ useStore: () => "unauthenticated" }));

it.each([
  ["/products/headphones.svg", false],
  ["/products/headphones.png", true],
  ["/products/items/headphones-1.jpg", true],
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
  const renderedImage = container.querySelector("img")!;
  if (imageUrl === "/products/items/headphones-1.jpg") {
    const expand = (url: string) => url.replace(/\/i\/(\d+)\/([a-z0-9-]+)\.jpg/g,
      (_, width, name) => `/_next/image?url=%2Fproducts%2Fitems%2F${name}.jpg&w=${width}&q=75`);
    const { props } = getImageProps({ src: imageUrl, alt: "Headphones", fill: true });
    expect(expand(renderedImage.getAttribute("srcset")!)).toBe(props.srcSet);
    expect(expand(renderedImage.getAttribute("src")!)).toBe(props.src);
  } else {
    expect(renderedImage.getAttribute("src")).not.toMatch(/^\/i\//);
  }
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

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
});

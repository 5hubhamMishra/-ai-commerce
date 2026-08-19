import type { MetadataRoute } from "next";
import { products, categories } from "@/lib/data";

const BASE_URL = "https://veloura.example.com";

const STATIC_ROUTES: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/shop", changeFrequency: "daily", priority: 0.9 },
  { path: "/search", changeFrequency: "weekly", priority: 0.5 },
  { path: "/recommendations", changeFrequency: "daily", priority: 0.6 },
  { path: "/ai-shopping", changeFrequency: "monthly", priority: 0.6 },
  { path: "/compare", changeFrequency: "monthly", priority: 0.4 },
];

/** Real, data-driven sitemap — every real product/category page, not a
 *  hand-maintained static list — so it can never drift out of sync with the
 *  actual catalog. Account/cart/checkout/order pages are deliberately
 *  excluded (private/session-specific, nothing for a crawler to index). */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries = STATIC_ROUTES.map((route) => ({
    url: `${BASE_URL}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const categoryEntries = categories.map((category) => ({
    url: `${BASE_URL}/category/${category.slug}`,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  const productEntries = products.map((product) => ({
    url: `${BASE_URL}/product/${product.id}`,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticEntries, ...categoryEntries, ...productEntries];
}

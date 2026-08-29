import type { MetadataRoute } from "next";
import { catalogApi } from "@ai-commerce/api-client";

// Vercel sets this automatically to the production domain (no scheme) on every deploy —
// falls back to the current known deployment for local builds / before a custom domain exists.
const BASE_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "web-lyart-three-94.vercel.app"}`;

const STATIC_ROUTES: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/shop", changeFrequency: "daily", priority: 0.9 },
  { path: "/ai-shopping", changeFrequency: "monthly", priority: 0.6 },
  { path: "/compare", changeFrequency: "monthly", priority: 0.4 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.4 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
];

async function fetchAllProducts() {
  const first = await catalogApi.listProducts({ page: 1, pageSize: 100 });
  const items = [...first.items];
  const totalPages = Math.max(1, Math.ceil(first.total / first.pageSize));
  for (let page = 2; page <= totalPages; page += 1) {
    const res = await catalogApi.listProducts({ page, pageSize: 100 });
    items.push(...res.items);
  }
  return items;
}

/** Real, data-driven sitemap — every real product/category page, not a hand-maintained
 *  static list — so it can never drift out of sync with the actual catalog. Account/cart/
 *  checkout/order/admin pages are deliberately excluded (private/session-specific, nothing
 *  for a crawler to index). Falls back to just the static routes if apps/api is briefly
 *  unreachable at build time, rather than failing the whole build. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries = STATIC_ROUTES.map((route) => ({
    url: `${BASE_URL}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  try {
    const [categories, products] = await Promise.all([catalogApi.listCategories(), fetchAllProducts()]);

    const categoryEntries = categories.map((category) => ({
      url: `${BASE_URL}/category/${category.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    }));

    const productEntries = products.map((product) => ({
      url: `${BASE_URL}/products/${product.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    return [...staticEntries, ...categoryEntries, ...productEntries];
  } catch {
    return staticEntries;
  }
}

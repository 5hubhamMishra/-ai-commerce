import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { catalogApi, ApiError } from "@ai-commerce/api-client";
import type { ListProductsResponse } from "@ai-commerce/types";
import {
  getDemoCategoryBySlug,
  listDemoProducts,
  mergeDemoProducts,
} from "@/lib/demo-catalog";
import CategoryPageClient from "./CategoryPageClient";
import { safeJsonLd } from "@/lib/jsonLd";

const SITE_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "web-lyart-three-94.vercel.app"}`;
const PAGE_SIZE = 20;

async function fetchCategory(slug: string) {
  try {
    return await catalogApi.getCategoryBySlug(slug);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    return getDemoCategoryBySlug(slug);
  }
}

async function fetchCategoryProducts(slug: string): Promise<ListProductsResponse> {
  try {
    const result = await catalogApi.listCategoryProducts(slug, {
      page: 1,
      pageSize: PAGE_SIZE,
    });
    return mergeDemoProducts(result, { category: slug, pageSize: PAGE_SIZE });
  } catch {
    return listDemoProducts({ category: slug, pageSize: PAGE_SIZE });
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await fetchCategory(slug);
  if (!category) return {};

  const description = `Shop ${category.name} at Veloura.`;
  return {
    title: category.name,
    description,
    alternates: { canonical: `/category/${category.slug}` },
    openGraph: { title: category.name, description },
    twitter: { title: category.name, description },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Independent fetches - fetchCategoryProducts only ever needs the URL's own slug (see its
  // signature above), never anything derived from the category record - so there's no reason
  // to wait for fetchCategory before starting it.
  const [category, initialResult] = await Promise.all([
    fetchCategory(slug),
    fetchCategoryProducts(slug),
  ]);
  // Deliberately no sibling loading.tsx for this route: a route-level loading.tsx makes Next
  // stream a 200 status for its fallback the instant this component suspends, before this
  // notFound() call ever runs - by the time it throws, the 200 is already committed and can't
  // be changed. Verified live (curl a nonexistent category slug and check the actual status
  // code, not just the rendered body) across both a page-component-only and a
  // generateMetadata-based notFound() call - neither survives a sibling loading.tsx. Confirmed
  // by directly removing the file: 200 with it present, correct 404 without it.
  if (!category) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: category.name,
    url: `${SITE_URL}/category/${category.slug}`,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        {
          "@type": "ListItem",
          position: 2,
          name: category.name,
          item: `${SITE_URL}/category/${category.slug}`,
        },
      ],
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <CategoryPageClient
        initialCategory={category}
        initialResult={initialResult}
      />
    </>
  );
}

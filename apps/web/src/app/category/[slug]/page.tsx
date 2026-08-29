import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { catalogApi, ApiError } from "@ai-commerce/api-client";
import { getDemoCategoryBySlug } from "@/lib/demo-catalog";
import CategoryPageClient from "./CategoryPageClient";

const SITE_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "web-lyart-three-94.vercel.app"}`;

async function fetchCategory(slug: string) {
  try {
    return await catalogApi.getCategoryBySlug(slug);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    return getDemoCategoryBySlug(slug);
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
  const category = await fetchCategory(slug);
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CategoryPageClient initialCategory={category} />
    </>
  );
}

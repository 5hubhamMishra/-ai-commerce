import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { catalogApi, ApiError } from "@ai-commerce/api-client";
import { getDemoProductBySlug } from "@/lib/demo-catalog";
import ProductDetailClient from "./ProductDetailClient";

const SITE_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "web-lyart-three-94.vercel.app"}`;

async function fetchProduct(slug: string) {
  try {
    return await catalogApi.getProductBySlug(slug);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return getDemoProductBySlug(slug);
    }
    return getDemoProductBySlug(slug);
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProduct(slug);
  if (!product) return {};

  return {
    title: product.name,
    description: product.description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      title: product.name,
      description: product.description,
      type: "website",
    },
    twitter: { title: product.name, description: product.description },
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await fetchProduct(slug);
  if (!product) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    url: `${SITE_URL}/products/${product.slug}`,
    ...(product.brand
      ? { brand: { "@type": "Brand", name: product.brand.name } }
      : {}),
    image: product.images.map((img) => img.url),
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/products/${product.slug}`,
      priceCurrency: product.currency,
      price: product.minPrice ?? undefined,
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductDetailClient initialProduct={product} />
    </>
  );
}

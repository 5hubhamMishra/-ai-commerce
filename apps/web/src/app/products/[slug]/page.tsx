import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ProductDetail } from "@ai-commerce/types";
import { catalogApi, ApiError } from "@ai-commerce/api-client";
import {
  getDemoProductBySlug,
  listDemoProducts,
  mergeDemoProducts,
} from "@/lib/demo-catalog";
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

async function fetchSimilarProducts(product: ProductDetail) {
  try {
    const result = await catalogApi.listProducts({
      category: product.category.slug,
      pageSize: 7,
    });
    return mergeDemoProducts(result, {
      category: product.category.slug,
      pageSize: 7,
    }).items.filter((item) => item.id !== product.id).slice(0, 6);
  } catch {
    return listDemoProducts({
      category: product.category.slug,
      pageSize: 7,
    }).items.filter((item) => item.id !== product.id).slice(0, 6);
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
  const image = product.images[0]?.url;

  return {
    title: product.name,
    description: product.description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      title: product.name,
      description: product.description,
      type: "website",
      ...(image ? { images: [image] } : {}),
    },
    twitter: {
      title: product.name,
      description: product.description,
      ...(image ? { images: [image] } : {}),
    },
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
  const initialSimilarProducts = await fetchSimilarProducts(product);

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
    // Mirrors exactly what the page itself shows (ProductDetailClient's review summary) — a
    // real aggregate from the reviews table, not invented; omitted entirely for products with
    // zero reviews rather than publishing a fake ratingValue/reviewCount.
    ...(product.rating != null && product.reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: product.reviewCount,
          },
        }
      : {}),
  };

  // A separate BreadcrumbList block, not a `breadcrumb` property on the Product object itself —
  // schema.org's Product type has no such property (unlike WebPage/CollectionPage, which
  // category/[slug] uses instead); two distinct entity types get two distinct JSON-LD blocks.
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: product.category.name,
        item: `${SITE_URL}/category/${product.category.slug}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: `${SITE_URL}/products/${product.slug}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <ProductDetailClient
        initialProduct={product}
        initialSimilarProducts={initialSimilarProducts}
      />
    </>
  );
}

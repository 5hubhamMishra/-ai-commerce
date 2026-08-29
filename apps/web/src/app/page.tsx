import Link from "next/link";
import Image from "next/image";
import { demoCategories, listDemoProducts } from "@/lib/demo-catalog";
import { fromProductListItem } from "@/lib/catalog-mappers";
import CatalogProductGrid from "@/components/catalog/CatalogProductGrid";
import Section from "@/components/Section";
import HomeDynamicSections from "./HomeDynamicSections";

const SITE_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "web-lyart-three-94.vercel.app"}`;

export default function Home() {
  const featuredCards = listDemoProducts({
    featured: true,
    pageSize: 10,
  }).items.map(fromProductListItem);
  const categories = demoCategories;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": ["WebSite", "OnlineStore"],
    name: "Veloura",
    url: SITE_URL,
    description:
      "Veloura is a personalized e-commerce storefront for discovering products through catalog browsing, search, recommendations, comparison, and a catalog-grounded AI shopping assistant.",
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Hero categories={categories} />

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <h2 className="font-display text-2xl font-semibold text-[var(--clr-text-primary)]">
            Discover products with less guesswork
          </h2>
          <p className="mt-3 leading-relaxed text-[var(--clr-text-secondary)]">
            Veloura brings a modern commerce catalog together with
            plain-language search, personalized recommendations, product
            comparison, wishlists, cart, checkout, and order tracking. Browse
            categories such as headphones, smartphones, laptops, wearables,
            gaming gear, cameras, footwear, apparel, groceries, and home audio,
            then use ShopAI when you want help narrowing choices by need,
            budget, or use case.
          </p>
        </div>
      </section>

      <Section
        title="Featured"
        subtitle="Handpicked from across the catalog"
        href="/shop"
      >
        <CatalogProductGrid products={featuredCards} />
      </Section>

      <HomeDynamicSections />

      <section
        id="categories"
        className="w-full py-14"
        style={{ background: "var(--clr-surface-2)" }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2
            className="font-display text-2xl font-semibold"
            style={{ color: "var(--clr-text-primary)" }}
          >
            Shop by category
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--clr-text-secondary)]">
            Start with a department, then refine by brand, price,
            availability, and product details as you move through the catalog.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {categories.map((c) => (
              <Link
                key={c.slug}
                href={`/category/${c.slug}`}
                className="group relative h-40 cursor-pointer overflow-hidden rounded-2xl"
                style={{ background: "var(--clr-surface)" }}
              >
                <Image
                  src={`/products/${c.slug}.svg`}
                  alt={c.name}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 to-transparent" />
                <div className="absolute bottom-0 inset-x-0 p-3 text-sm font-semibold text-white">
                  {c.name}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Hero({ categories }: { categories: typeof demoCategories }) {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, #0c0a09 0%, #1c1917 60%, #292524 100%)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 30% 50%, rgba(180,83,9,0.18) 0%, transparent 70%)",
        }}
      />
      <div className="relative z-10 mx-auto grid max-w-7xl gap-8 px-4 py-20 sm:px-6 md:grid-cols-2 md:items-center lg:px-8">
        <div>
          <p
            className="mb-4 text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--clr-accent)" }}
          >
            Personalized commerce, grounded in the catalog
          </p>
          <h1 className="font-display text-5xl font-semibold leading-[1.1] text-white sm:text-6xl">
            Veloura
          </h1>
          <p
            className="mt-5 max-w-md text-base leading-relaxed"
            style={{ color: "#d6d3d1" }}
          >
            Shopping that gets you. Search in plain language, compare products,
            get recommendations, and ask ShopAI for catalog-aware guidance.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/shop" className="btn btn-accent">
              Browse the catalog
            </Link>
            <Link
              href="/ai-shopping"
              className="btn"
              style={{
                background: "rgba(255,255,255,0.08)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              Ask ShopAI
            </Link>
          </div>
        </div>
        <div className="hidden md:block">
          <div className="grid grid-cols-2 gap-3">
            {categories.slice(0, 8).map((c, i) => (
              <Link
                key={c.slug}
                href={`/category/${c.slug}`}
                className={`relative h-36 cursor-pointer overflow-hidden rounded-2xl ring-[var(--clr-accent)] transition-all duration-200 hover:ring-2 ${
                  i === 1 || i === 4
                    ? "mt-5"
                    : i === 2 || i === 5
                      ? "-mt-5"
                      : ""
                }`}
              >
                <Image
                  src={`/products/${c.slug}.svg`}
                  alt={c.name}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 to-transparent" />
                <div className="absolute bottom-2 left-2.5 text-xs font-semibold text-white">
                  {c.name}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

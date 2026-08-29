import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn what Veloura provides: catalog browsing, search, recommendations, comparison, checkout, and a catalog-grounded AI shopping assistant.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
      <h1 className="font-display text-4xl font-semibold text-[var(--clr-text-primary)]">
        About Veloura
      </h1>
      <p className="mt-5 leading-relaxed text-[var(--clr-text-secondary)]">
        Veloura is an AI-native commerce storefront built around product
        discovery. It combines a browsable catalog with search,
        recommendations, comparison tools, wishlist, cart, checkout, orders,
        returns, and ShopAI, a shopping assistant that works from the catalog
        instead of generic guesses.
      </p>
      <p className="mt-4 leading-relaxed text-[var(--clr-text-secondary)]">
        The project is designed as a production-shaped e-commerce application:
        public catalog pages are discoverable, account and order areas stay
        private, and product information comes from the existing catalog data.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/shop" className="btn btn-accent">
          Browse catalog
        </Link>
        <Link href="/ai-shopping" className="btn">
          Ask ShopAI
        </Link>
      </div>
    </main>
  );
}

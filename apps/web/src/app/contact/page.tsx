import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Find support paths for Veloura shopping, account, catalog, cart, checkout, and order questions.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
      <h1 className="font-display text-4xl font-semibold text-[var(--clr-text-primary)]">
        Contact Veloura
      </h1>
      <p className="mt-5 leading-relaxed text-[var(--clr-text-secondary)]">
        For shopping help, start with the catalog, search, or ShopAI. Signed-in
        shoppers can review profile, wishlist, cart, checkout, and order
        information from their account pages.
      </p>
      <p className="mt-4 leading-relaxed text-[var(--clr-text-secondary)]">
        Veloura does not publish a support email or phone number in this
        repository, so this page only lists verified in-app support paths.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/ai-shopping" className="btn btn-accent">
          Ask ShopAI
        </Link>
        <Link href="/orders" className="btn">
          View orders
        </Link>
        <Link href="/profile" className="btn">
          Account
        </Link>
      </div>
    </main>
  );
}

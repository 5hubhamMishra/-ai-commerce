import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "Veloura privacy overview for account, cart, order, wishlist, and personalization data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
      <h1 className="font-display text-4xl font-semibold text-[var(--clr-text-primary)]">
        Privacy
      </h1>
      <p className="mt-5 leading-relaxed text-[var(--clr-text-secondary)]">
        Veloura uses account, cart, wishlist, order, review, and behavioral
        shopping signals to support normal commerce features and personalize
        product discovery. Private account and order pages require
        authentication and are excluded from public search discovery.
      </p>
      <p className="mt-4 leading-relaxed text-[var(--clr-text-secondary)]">
        Server-only credentials and private API details should remain outside
        the browser bundle. Public machine-readable files describe only public
        storefront routes and catalog resources.
      </p>
    </main>
  );
}

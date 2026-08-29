"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { useCategories } from "@/lib/hooks/useCategories";

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-3">
        {title}
      </h3>
      {links.map((link) => (
        <Link
          key={link.label}
          href={link.href}
          className="text-sm text-stone-400 hover:text-white transition-colors duration-150 w-fit"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

export default function Footer() {
  const user = useStore((s) => s.user);
  const categories = useCategories();

  return (
    <footer className="bg-stone-950 text-stone-300 border-t border-stone-800">
      <div className="max-w-7xl mx-auto px-4 pt-14 pb-10 grid grid-cols-2 md:grid-cols-4 gap-10">
        <div className="col-span-2 md:col-span-1">
          <Link
            href="/"
            className="font-display text-xl font-semibold text-white"
          >
            Veloura
          </Link>
          <p className="text-sm text-stone-400 mt-1">Shopping that gets you.</p>
          <p className="text-xs text-stone-400 mt-3 leading-relaxed">
            Veloura is a modern e-commerce demonstration storefront showcasing
            personalized recommendations, dynamic design, catalog-grounded
            search, and an AI shopping assistant.
          </p>
        </div>

        <FooterCol
          title="Shop"
          links={categories.map((c) => ({
            label: c.name,
            href: `/category/${c.slug}`,
          }))}
        />
        <FooterCol
          title="Account"
          links={[
            user
              ? { label: "My Profile", href: "/profile" }
              : { label: "Sign In", href: "/login" },
            { label: "Wishlist", href: "/wishlist" },
            { label: "Shopping Cart", href: "/cart" },
            { label: "Your Orders", href: "/orders" },
          ]}
        />
        <FooterCol
          title="Discover"
          links={[
            { label: "For You", href: "/recommendations" },
            { label: "AI Assistant", href: "/ai-shopping" },
            { label: "Compare Products", href: "/compare" },
            { label: "About", href: "/about" },
            { label: "Contact", href: "/contact" },
            { label: "Privacy", href: "/privacy" },
          ]}
        />
      </div>

      <div className="border-t border-stone-800 mx-4" />

      <div className="max-w-7xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-stone-400">
          &copy; {new Date().getFullYear()} Veloura AI Commerce. All rights
          reserved.
        </div>
      </div>
    </footer>
  );
}

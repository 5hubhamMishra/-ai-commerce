import Link from "next/link";

function FooterCol({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-3">{title}</h3>
      {links.map((link) => (
        <Link
          key={link.label}
          href={link.href}
          className="text-sm text-stone-500 hover:text-white transition-colors duration-150 w-fit"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

export default function Footer() {
  return (
    <footer className="bg-stone-950 text-stone-300 border-t border-stone-800">
      <div className="max-w-7xl mx-auto px-4 pt-14 pb-10 grid grid-cols-2 md:grid-cols-4 gap-10">
        <div className="col-span-2 md:col-span-1">
          <Link href="/" className="font-display text-xl font-semibold text-white">
            Veloura
          </Link>
          <p className="text-sm text-stone-400 mt-1">
            Shopping that gets you.
          </p>
          <p className="text-xs text-stone-500 mt-3 leading-relaxed">
            Veloura is a modern AI-powered e-commerce demonstration storefront showcasing advanced recommendations, dynamic design, and intelligent search capabilities.
          </p>
        </div>

        <FooterCol
          title="Shop"
          links={[
            { label: "All Products", href: "/shop" },
            { label: "Electronics", href: "/shop?category=Electronics" },
            { label: "Fashion", href: "/shop?category=Fashion" },
            { label: "Home & Living", href: "/shop?category=Home+%26+Living" },
            { label: "Beauty", href: "/shop?category=Beauty" },
          ]}
        />
        <FooterCol
          title="Account"
          links={[
            { label: "Sign In", href: "/profile" },
            { label: "My Profile", href: "/profile" },
            { label: "Wishlist", href: "/wishlist" },
            { label: "Shopping Cart", href: "/cart" },
          ]}
        />
        <FooterCol
          title="Discover"
          links={[
            { label: "For You", href: "/recommendations" },
            { label: "AI Assistant", href: "/ai-shopping" },
            { label: "Compare Products", href: "/compare" },
            { label: "About Us", href: "#" },
          ]}
        />
      </div>

      <div className="border-t border-stone-800 mx-4" />

      <div className="max-w-7xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-stone-600">
          &copy; {new Date().getFullYear()} Veloura AI Commerce. All rights reserved.
        </div>
        <div className="flex items-center gap-4">
          <Link href="/profile" className="text-xs text-stone-600 hover:text-stone-400 transition-colors">
            Privacy Policy
          </Link>
          <Link href="/admin" className="text-xs text-stone-600 hover:text-stone-400 transition-colors">
            Admin Dashboard
          </Link>
        </div>
      </div>
    </footer>
  );
}

import Link from "next/link";

const links = [
  { label: "Home", href: "/" },
  { label: "Shop catalog", href: "/shop" },
  { label: "Categories", href: "/#categories" },
  { label: "Search", href: "/search" },
  { label: "Account", href: "/login" },
];

export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-3xl flex-col px-4 py-20 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold uppercase tracking-widest text-[var(--clr-accent)]">
        404
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--clr-text-primary)]">
        This Veloura page was not found
      </h1>
      <p className="mt-4 max-w-xl leading-relaxed text-[var(--clr-text-secondary)]">
        The page may have moved, the product may no longer be listed, or the
        address may be mistyped. Use one of these paths to get back to shopping.
      </p>
      <nav aria-label="404 recovery links" className="mt-8 flex flex-wrap gap-3">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="btn">
            {link.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}

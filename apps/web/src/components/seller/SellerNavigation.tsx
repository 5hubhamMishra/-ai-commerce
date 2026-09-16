"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [['/seller', 'Overview'], ['/seller/products', 'My Products'], ['/seller/products/new', 'Add Product'], ['/seller/orders', 'Orders'], ['/seller/profile', 'Shop Profile']] as const;

export default function SellerNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Seller navigation" className="mb-8 flex flex-wrap gap-2 border-b border-[var(--clr-border)] pb-4 text-sm">
    {links.map(([href, title]) => {
      const active = pathname === href || (href === '/seller/products' && /^\/seller\/products\/[^/]+\/edit$/.test(pathname));
      return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`rounded-xl px-4 py-3 font-semibold transition-colors ${active ? 'bg-[var(--clr-ink)] text-white' : 'text-[var(--clr-text-secondary)] hover:bg-[var(--clr-surface-2)] hover:text-[var(--clr-text-primary)]'}`}>{title}</Link>;
    })}
  </nav>;
}

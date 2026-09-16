import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import SellerNavigation from '@/components/seller/SellerNavigation';
import { readSellerSession, SELLER_COOKIE } from '@/lib/seller-session';

export const metadata: Metadata = { title: 'Seller Center', robots: { index: false, follow: false } };

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(SELLER_COOKIE)?.value;
  if (!token || !await readSellerSession(token)) redirect('/login?mode=seller&redirect=/seller');
  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-[var(--clr-accent)]">Your business, at a glance</p><p className="mt-1 font-display text-2xl font-semibold">Seller Center</p></div>
      <div className="flex gap-4 text-sm font-medium"><Link href="/profile" className="hover:underline">Account</Link><Link href="/shop" className="text-[var(--clr-accent)] hover:underline">Visit Veloura <span aria-hidden="true">↗</span></Link></div>
    </div>
    <SellerNavigation />{children}
  </div>;
}

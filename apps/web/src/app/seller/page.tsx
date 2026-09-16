"use client";
import Link from 'next/link';
import type { SellerOverview } from '@ai-commerce/api-client';
import { useSellerResource } from '@/components/seller/useSellerResource';
import LoadState from '@/components/seller/LoadState';

export default function SellerOverviewPage() {
  const { data, error, reload } = useSellerResource<SellerOverview>('/sellers/me/overview');
  return <section><div className="mb-6"><h1 className="font-display text-3xl font-semibold">Shop overview</h1><p className="mt-2 text-sm text-[var(--clr-text-secondary)]">Keep your catalog ready for your next customer.</p></div>
    {error || !data ? <LoadState error={error} retry={reload} /> : <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">{([['Total products', data.total], ['Published', data.published], ['Drafts', data.drafts], ['Archived', data.archived], ['Low stock (1–5 available)', data.lowStock], ['Out of stock', data.outOfStock]] as const).map(([label, value]) => <div key={label} className="rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-5"><p className="text-sm text-[var(--clr-text-secondary)]">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>)}</div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-[var(--clr-accent-border)] bg-[var(--clr-accent-subtle)] p-6">
        <div><h2 className="font-display text-xl font-semibold">{data.total === 0 ? 'Your first product starts here' : 'Make room for your next bestseller'}</h2><p className="mt-1 max-w-lg text-sm text-[var(--clr-accent-text)]">Add photos, set your price, and save a draft. Publish when you’re ready for customers to find it.</p></div>
        <Link className="btn btn-accent shrink-0" href="/seller/products/new">Add Product</Link>
      </div>
      <section className="mt-6 rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-6" aria-labelledby="recent-seller-orders">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="recent-seller-orders" className="font-display text-xl font-semibold">Recent orders</h2><Link href="/seller/orders" className="text-sm font-semibold text-[var(--clr-accent)]">View order items</Link></div>
        <p className="mt-2 text-sm text-[var(--clr-text-secondary)]">{data.orderCount} {data.orderCount === 1 ? 'order' : 'orders'} containing your products</p>
        {data.recentOrders.length === 0 ? <p className="mt-4 text-sm">No orders yet.</p> : <ul className="mt-4 divide-y divide-[var(--clr-border)]">{data.recentOrders.map((order) => <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span className="min-w-0 break-all">Order {order.id}</span><span>{new Date(order.createdAt).toLocaleDateString()} · {order.status.replaceAll('_', ' ')}</span></li>)}</ul>}
      </section>
    </>}
  </section>;
}

"use client";
import { useState } from 'react';
import type { SellerOrderItem } from '@ai-commerce/api-client';
import { useSellerResource } from '@/components/seller/useSellerResource';
import LoadState from '@/components/seller/LoadState';
import { formatPrice } from '@/lib/format';

export default function SellerOrders() {
  const [page, setPage] = useState(1);
  const { data, error, reload } = useSellerResource<{ items: SellerOrderItem[]; total: number; pageSize: number }>(`/sellers/me/orders?page=${page}`);
  return <section><h1 className="mb-4 font-display text-3xl font-semibold">Your order items</h1><p className="mb-6">Only items purchased from your shop appear here.</p>
    {error || !data ? <LoadState error={error} retry={reload} /> : <>
      {!data.items.length && <p>No orders yet.</p>}
      <div className="grid gap-4 md:grid-cols-2">{data.items.map((item) => <article key={item.id} className="min-w-0 rounded-2xl border border-[var(--clr-border)] p-5"><h2 className="break-words font-semibold">{item.productName}</h2><p className="mt-2 break-all text-sm">Order {item.orderId}</p><p className="text-sm">{new Date(item.orderCreatedAt).toLocaleDateString()} · {item.orderStatus.replaceAll('_', ' ')}</p><p className="mt-3">{item.quantity} × {formatPrice(item.unitPrice)} = {formatPrice(item.lineTotal)}</p></article>)}</div>
      <div className="mt-6 flex items-center gap-4"><button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="btn btn-secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</button></div>
    </>}
  </section>;
}

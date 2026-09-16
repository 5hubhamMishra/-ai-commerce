"use client";
import { useState } from 'react';
import Link from 'next/link';
import type { ListProductsResponse, ProductStatus } from '@ai-commerce/types';
import { sellersApi, toQueryString } from '@ai-commerce/api-client';
import { useSellerResource } from '@/components/seller/useSellerResource';
import LoadState from '@/components/seller/LoadState';
import ProductImagePreview from '@/components/seller/ProductImagePreview';
import { formatPrice } from '@/lib/format';

export default function SellerProductsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const { data, error, reload } = useSellerResource<ListProductsResponse>(`/sellers/me/products${toQueryString({ page, search, status: status || undefined })}`);
  async function change(id: string, next: ProductStatus) {
    if (next === 'ARCHIVED' && !window.confirm('Archive this product? It will no longer be available to buy. Existing orders are preserved.')) return;
    setBusy(true); setMessage('');
    try { await sellersApi.update(id, { status: next }); setMessage('Product updated.'); reload(); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Product could not be updated.'); }
    finally { setBusy(false); }
  }
  return <section>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><h1 className="font-display text-3xl font-semibold">My Products</h1><Link className="btn btn-accent" href="/seller/products/new">Add Product</Link></div>
    <form className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-4" onSubmit={(e) => { e.preventDefault(); setSearch(String(new FormData(e.currentTarget).get('search'))); setPage(1); }}>
      <label className="min-w-0 flex-1 basis-48 text-sm font-medium">Search products<input name="search" className="input mt-1" type="search" placeholder="Search your catalog" /></label>
      <label className="text-sm font-medium">Status<select value={status} className="input mt-1" onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="ACTIVE">Published</option><option value="ARCHIVED">Archived</option></select></label>
      <button className="btn btn-secondary">Search</button>
    </form>
    {message && <p role="status" className="mb-4">{message}</p>}
    {error || !data ? <LoadState error={error} retry={reload} /> : <>
      {data.items.length === 0 && <p>No products found. Add your first product or change your filters.</p>}
      <div className="grid gap-4 md:grid-cols-2">{data.items.map((p) => <article key={p.id} className="min-w-0 rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-5">
        {p.primaryImageUrl && <ProductImagePreview productId={p.id} url={p.primaryImageUrl} alt={p.name} />}
        <h2 className="break-words text-lg font-semibold"><Link href={`/seller/products/${p.id}/edit`}>{p.name}</Link></h2>
        <p className="my-2 text-sm">{p.category.name} · {p.minPrice === null ? 'Price needed' : formatPrice(p.minPrice)} · {p.inStock ? 'In stock' : 'Out of stock'}</p>
        <p className={`mb-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${p.status === 'ACTIVE' ? 'bg-[var(--clr-success-bg)] text-[var(--clr-success-text)]' : p.status === 'DRAFT' ? 'bg-[var(--clr-warning-bg)] text-[var(--clr-warning-text)]' : 'bg-[var(--clr-surface-2)] text-[var(--clr-text-secondary)]'}`}>{p.status === 'ACTIVE' ? 'Published' : p.status === 'DRAFT' ? 'Draft' : 'Archived'}</p>
        <div className="flex flex-wrap gap-2"><Link className="btn btn-secondary" href={`/seller/products/${p.id}/edit`}>Edit product</Link>
          <button className="btn btn-secondary" disabled={busy} onClick={() => void change(p.id, p.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE')}>{p.status === 'ACTIVE' ? 'Unpublish' : 'Publish'}</button>
          {p.status !== 'ARCHIVED' && <button className="btn btn-secondary" disabled={busy} onClick={() => void change(p.id, 'ARCHIVED')}>Archive</button>}
          {p.status === 'ACTIVE' && <Link className="btn btn-secondary" href={`/products/${p.slug}`}>View product</Link>}
        </div>
      </article>)}</div>
      <div className="mt-6 flex items-center gap-4"><button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="btn btn-secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</button></div>
    </>}
  </section>;
}

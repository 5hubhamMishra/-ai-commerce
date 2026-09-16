"use client";
import { useState } from 'react';
import Link from 'next/link';
import { sellersApi, type SellerProfile } from '@ai-commerce/api-client';
import { useSellerResource } from '@/components/seller/useSellerResource';
import LoadState from '@/components/seller/LoadState';

export default function ShopProfile() {
  const { data, error, reload } = useSellerResource<SellerProfile>('/sellers/me');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true); setMessage('');
    try { await sellersApi.updateProfile(String(form.get('name')).trim(), String(form.get('description')).trim()); setMessage('Shop profile saved.'); reload(); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Profile could not be saved.'); }
    finally { setBusy(false); }
  }
  return <section className="max-w-xl"><h1 className="mb-6 font-display text-3xl font-semibold">Shop Profile</h1>
    {error || !data ? <LoadState error={error} retry={reload} /> : <>
      <p className="mb-4">{data.status === 'VERIFIED' ? 'Your shop can publish products.' : `Shop status: ${data.status.toLowerCase().replaceAll('_', ' ')}. ${data.rejectReason ?? data.suspendReason ?? ''}`}</p>
      <form onSubmit={submit} className="space-y-5"><label className="block">Shop name<input name="name" className="input mt-1" defaultValue={data.businessName} minLength={2} maxLength={200} required /></label><label className="block">Shop description<textarea name="description" className="input mt-1" rows={5} defaultValue={data.description ?? ''} maxLength={2000} /></label><button className="btn btn-accent" disabled={busy}>{busy ? 'Saving…' : 'Save shop profile'}</button></form>
      {data.status === 'VERIFIED' && <Link href={`/shops/${data.slug}`} className="btn btn-secondary mt-4">View public shop</Link>}
    </>}{message && <p role="status" className="mt-4">{message}</p>}
  </section>;
}

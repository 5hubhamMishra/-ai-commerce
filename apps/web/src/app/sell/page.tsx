"use client";
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi, sellersApi } from '@ai-commerce/api-client';
import { useStore } from '@/lib/store';
import { isSeller, syncSellerSession } from '@/lib/seller-session';

export default function OpenShop() {
  const router = useRouter();
  const user = useStore((s) => s.user);
  const authStatus = useStore((s) => s.authStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function enter() {
    const token = useStore.getState().accessToken;
    if (!token) throw new Error('Please sign in again.');
    await syncSellerSession(token);
    router.push('/seller');
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    const data = new FormData(e.currentTarget);
    try {
      await sellersApi.apply(String(data.get('name')).trim(), String(data.get('description')).trim());
      useStore.setState({ user: await authApi.me() });
      await enter();
    } catch (err) { setError(err instanceof Error ? err.message : 'Your shop could not be opened. Please try again.'); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto max-w-lg px-4 py-12">
    <h1 className="font-display text-3xl font-semibold">Open your shop</h1>
    <p className="my-4 text-[var(--clr-text-secondary)]">Add your products to Veloura and manage them from your Seller Center.</p>
    {authStatus === 'idle' || authStatus === 'checking' ? <p role="status">Checking your session…</p> : !user ? <Link className="btn btn-accent" href="/login?redirect=/sell">Sign in to continue</Link> : isSeller(user) ? <button className="btn btn-accent" onClick={() => { setBusy(true); void enter().catch((e: Error) => setError(e.message)).finally(() => setBusy(false)); }} disabled={busy}>Go to Seller Center</button> : <form onSubmit={submit} className="space-y-5 rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-6">
      <label className="block">Shop name<input className="input mt-2" name="name" required minLength={2} maxLength={200} /></label>
      <label className="block">Shop description<textarea className="input mt-2" name="description" maxLength={2000} rows={4} /></label>
      <button className="btn btn-accent" disabled={busy}>{busy ? 'Opening shop…' : 'Create shop'}</button>
    </form>}
    {error && <p role="alert" className="mt-4 text-[var(--clr-error)]">{error}</p>}
  </section>;
}

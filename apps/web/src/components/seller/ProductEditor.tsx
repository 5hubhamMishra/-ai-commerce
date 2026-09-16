"use client";
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { catalogApi, sellersApi } from '@ai-commerce/api-client';
import type { Brand, Category, ProductDetail } from '@ai-commerce/types';
import { useStore } from '@/lib/store';
import LoadState from './LoadState';
import ProductImagePreview from './ProductImagePreview';

type Fields = { name: string; description: string; categoryId: string; brandId: string; sku: string; price: string; compareAtPrice: string; stock: string };
const empty: Fields = { name: '', description: '', categoryId: '', brandId: '', sku: '', price: '', compareAtPrice: '', stock: '0' };
function flatten(categories: Category[]): Category[] { return categories.flatMap((c) => [c, ...flatten(c.children ?? [])]); }

function PendingImage({ file }: { file: File }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => setSrc(String(reader.result));
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);
  return src ? <Image src={src} alt={`Selected image: ${file.name}`} width={160} height={160} unoptimized className="h-32 w-full object-contain" /> : null;
}

export default function ProductEditor({ id }: { id?: string }) {
  const router = useRouter();
  const authStatus = useStore((s) => s.authStatus);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [variantId, setVariantId] = useState<string>();
  const [fields, setFields] = useState<Fields>(empty);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [specKey, setSpecKey] = useState('');
  const [specValue, setSpecValue] = useState('');
  const [originalStock, setOriginalStock] = useState('0');

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let active = true;
    async function load() {
      const [cats, bs, p] = await Promise.all([catalogApi.listCategories(), catalogApi.listBrands(), id ? sellersApi.product(id) : null]);
      const v = p?.variants.find((v) => v.isDefault) ?? p?.variants[0];
      const stock = v ? (await sellersApi.inventory(v.id)).reduce((n, row) => n + row.quantityOnHand, 0) : 0;
      if (!active) return;
      setCategories(flatten(cats)); setBrands(bs); setProduct(p); setVariantId(v?.id);
      setFields(p ? { name: p.name, description: p.description, categoryId: p.category.id, brandId: p.brand?.id ?? '', sku: v?.sku ?? '', price: v ? String(v.price) : '', compareAtPrice: v?.compareAtPrice == null ? '' : String(v.compareAtPrice), stock: String(stock) } : empty);
      setOriginalStock(String(stock)); setLoaded(true); setLoadError('');
    }
    void load().catch((e: Error) => { if (active) setLoadError(e.message); });
    return () => { active = false; };
  }, [id, revision, authStatus]);

  function field(key: keyof Fields, value: string) { setFields((old) => ({ ...old, [key]: value })); }
  async function switchVariant(value: string) {
    const v = product?.variants.find((v) => v.id === value);
    if (!v) return;
    setBusy(true); setError('');
    try {
      const stock = (await sellersApi.inventory(v.id)).reduce((n, row) => n + row.quantityOnHand, 0);
      setVariantId(v.id); setOriginalStock(String(stock));
      setFields((old) => ({ ...old, sku: v.sku, price: String(v.price), compareAtPrice: v.compareAtPrice == null ? '' : String(v.compareAtPrice), stock: String(stock) }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Stock could not be loaded.'); }
    finally { setBusy(false); }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const publish = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'publish';
    setBusy(true); setError(''); setMessage('');
    let saved = product;
    try {
      const body = { name: fields.name.trim(), description: fields.description.trim(), categoryId: fields.categoryId, brandId: fields.brandId || null };
      saved = saved ? await sellersApi.update(saved.id, body) : await sellersApi.create(body);
      setProduct(saved);
      const variant = { sku: fields.sku.trim(), price: Number(fields.price), compareAtPrice: fields.compareAtPrice ? Number(fields.compareAtPrice) : null };
      saved = await sellersApi.variant(saved.id, variantId, variant);
      setProduct(saved);
      const v = saved.variants.find((v) => v.id === variantId) ?? saved.variants.find((v) => v.sku === variant.sku)!;
      setVariantId(v.id);
      if (!variantId || fields.stock !== originalStock) {
        await sellersApi.stock(v.id, Number(fields.stock)); setOriginalStock(fields.stock);
      }
      for (const file of files) {
        saved = await sellersApi.upload(saved.id, file); setProduct(saved);
        setFiles((remaining) => remaining.filter((f) => f !== file));
      }
      if (publish) { saved = await sellersApi.update(saved.id, { status: 'ACTIVE' }); setProduct(saved); }
      setMessage(publish ? 'Product published.' : 'Product saved.');
      if (!id) router.replace(`/seller/products/${saved.id}/edit`);
    } catch (err) {
      setError(`${err instanceof Error ? err.message : 'Save failed.'}${saved ? ' Your product is saved in My Products. Correct the problem and save again; completed uploads are kept.' : ''}`);
    } finally { setBusy(false); }
  }

  async function imageAction(action: () => Promise<ProductDetail>) {
    setBusy(true); setError('');
    try { setProduct(await action()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Image could not be updated.'); }
    finally { setBusy(false); }
  }

  if (!loaded || loadError || authStatus === 'unauthenticated') return <LoadState error={loadError || (authStatus === 'unauthenticated' ? 'Session expired. Please sign in again.' : undefined)} retry={() => setRevision((n) => n + 1)} />;
  return <section className="max-w-3xl"><h1 className="mb-6 font-display text-3xl font-semibold">{id ? 'Edit product' : 'Add Product'}</h1>
    <form onSubmit={save} className="space-y-6">
      <fieldset disabled={busy} className="space-y-5 rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-5 sm:p-7">
        <legend className="px-2 font-semibold">Product information</legend>
        <label className="block">Product name<input className="input mt-1" required maxLength={200} value={fields.name} onChange={(e) => field('name', e.target.value)} /></label>
        <label className="block">Description<textarea className="input mt-1" required maxLength={5000} rows={5} value={fields.description} onChange={(e) => field('description', e.target.value)} /></label>
        <div className="grid gap-5 sm:grid-cols-2"><label>Category<select className="input mt-1" required value={fields.categoryId} onChange={(e) => field('categoryId', e.target.value)}><option value="">Choose a category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Brand<select className="input mt-1" value={fields.brandId} onChange={(e) => field('brandId', e.target.value)}><option value="">No brand</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
      </fieldset>
      <fieldset disabled={busy} className="grid gap-5 rounded-2xl border border-[var(--clr-border)] p-5 sm:grid-cols-2 sm:p-7"><legend className="px-2 font-semibold">Price and inventory</legend>
        {product && product.variants.length > 1 && <label className="sm:col-span-2">Variant<select className="input" value={variantId} onChange={(e) => void switchVariant(e.target.value)}>{product.variants.map((v) => <option key={v.id} value={v.id}>{v.sku}</option>)}</select></label>}
        <label>SKU<input className="input mt-1" required maxLength={64} value={fields.sku} onChange={(e) => field('sku', e.target.value)} /></label>
        <label>Selling price (INR)<input className="input mt-1" type="number" min="0.01" max="9999999999.99" step="0.01" required value={fields.price} onChange={(e) => field('price', e.target.value)} /></label>
        <label>Original price (optional)<input className="input mt-1" type="number" min="0.01" max="9999999999.99" step="0.01" value={fields.compareAtPrice} onChange={(e) => field('compareAtPrice', e.target.value)} /></label>
        <label>Stock on hand<input className="input mt-1" type="number" min="0" max="2147483647" step="1" required value={fields.stock} onChange={(e) => field('stock', e.target.value)} /></label>
        <p className="text-sm text-[var(--clr-text-secondary)] sm:col-span-2">Stock on hand includes units already reserved for orders.</p>
      </fieldset>
      <fieldset disabled={busy} className="space-y-4 rounded-2xl border border-[var(--clr-border)] p-5 sm:p-7"><legend className="px-2 font-semibold">Product images</legend>
        <p className="text-sm">Up to 8 JPEG, PNG or WebP images, 2 MB each. Images upload when you save.</p>
        <label className="block">Upload images<input className="input mt-2" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => {
          const chosen = Array.from(e.target.files ?? []); e.target.value = '';
          if (chosen.some((f) => f.size > 2 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(f.type))) { setError('Choose JPEG, PNG or WebP files up to 2 MB each.'); return; }
          if (chosen.length + files.length + (product?.images.length ?? 0) > 8) { setError('A product can have up to 8 images.'); return; }
          setError(''); setFiles((old) => [...old, ...chosen]);
        }} /></label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{product?.images.map((img) => <div className="min-w-0 rounded-xl border border-[var(--clr-border)] p-2" key={img.id}><ProductImagePreview productId={product.id} url={img.url} alt={img.altText ?? product.name} /><button type="button" className="btn btn-secondary mt-2 w-full text-xs" disabled={img.isPrimary} onClick={() => void imageAction(() => sellersApi.primary(product.id, img.id))}>{img.isPrimary ? 'Primary image' : 'Make primary'}</button><button type="button" className="btn btn-secondary mt-1 w-full text-xs" onClick={() => { if (window.confirm('Remove this image?')) void imageAction(() => sellersApi.removeImage(product.id, img.id)); }}>Remove image</button></div>)}
          {files.map((file, index) => <div className="min-w-0 rounded-xl border border-[var(--clr-border)] p-2" key={`${file.name}-${index}`}><PendingImage file={file} /><p className="truncate text-xs">{file.name}</p><button type="button" className="btn btn-secondary mt-2 w-full text-xs" onClick={() => setFiles((old) => old.filter((_, i) => i !== index))}>Remove selected image</button></div>)}
        </div>
      </fieldset>
      {error && <p role="alert" className="text-[var(--clr-error)]">{error}</p>}{message && <p role="status">{message}</p>}
      <div className="flex flex-wrap gap-3"><button className="btn btn-secondary" disabled={busy} type="submit" value="save">{busy ? 'Saving…' : product && product.status !== 'DRAFT' ? 'Save changes' : 'Save draft'}</button><button className="btn btn-accent" disabled={busy} type="submit" value="publish">Save and publish</button><Link className="btn btn-secondary" href="/seller/products">My Products</Link></div>
    </form>
    {product && <section className="mt-8 rounded-2xl border border-[var(--clr-border)] p-5"><h2 className="mb-4 font-semibold">Specifications</h2><dl className="space-y-2">{product.specifications.map((s) => <div key={s.id} className="flex flex-wrap gap-2"><dt className="font-medium">{s.key}:</dt><dd className="break-words">{s.value}</dd><button className="text-sm underline" disabled={busy} onClick={() => void imageAction(() => sellersApi.removeSpecification(product.id, s.id))}>Remove {s.key}</button></div>)}</dl>
      <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void imageAction(() => sellersApi.specification(product.id, { key: specKey.trim(), value: specValue.trim() })); }}><label>Detail name<input className="input mt-1" required maxLength={100} value={specKey} onChange={(e) => setSpecKey(e.target.value)} /></label><label>Value<input className="input mt-1" required maxLength={500} value={specValue} onChange={(e) => setSpecValue(e.target.value)} /></label><button className="btn btn-secondary" disabled={busy}>Add specification</button></form>
    </section>}
  </section>;
}

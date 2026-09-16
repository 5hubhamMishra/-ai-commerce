import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, sellersApi } from '@ai-commerce/api-client';
import CatalogProductCard from '@/components/catalog/CatalogProductCard';
import { fromProductListItem } from '@/lib/catalog-mappers';

export default async function PublicShop({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> }) {
  const { slug } = await params;
  const page = Math.max(1, Number.parseInt((await searchParams).page ?? '1', 10) || 1);
  const result = await Promise.all([sellersApi.publicProfile(slug), sellersApi.publicProducts(slug, page)]).catch((error: unknown) => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  const [shop, products] = result;
  return <section className="mx-auto max-w-6xl px-4 py-10"><h1 className="break-words font-display text-3xl font-semibold">{shop.businessName}</h1><p className="my-5 max-w-2xl whitespace-pre-wrap break-words">{shop.description}</p>
    {!products.items.length && <p>No published products yet.</p>}
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{products.items.map((p) => <CatalogProductCard key={p.id} product={fromProductListItem(p)} />)}</div>
    <nav aria-label="Shop pages" className="mt-6 flex gap-4">{page > 1 && <Link className="btn btn-secondary" href={`/shops/${slug}?page=${page - 1}`}>Previous</Link>}{page * products.pageSize < products.total && <Link className="btn btn-secondary" href={`/shops/${slug}?page=${page + 1}`}>Next</Link>}</nav>
  </section>;
}

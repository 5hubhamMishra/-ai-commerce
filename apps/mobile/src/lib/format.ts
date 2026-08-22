// Mirrors apps/web/src/lib/format.ts's formatPrice exactly — same currency/locale.
export function formatPrice(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

// Product image URLs from apps/api (ProductListItem.primaryImageUrl, ProductImage.url) are
// relative paths served by apps/web's own static /public files (e.g.
// "/products/items/accessories-2.jpg") — there is no separate image CDN/host. apps/web
// resolves these against its own origin automatically via next/image; mobile has no
// equivalent, so this prefixes them with apps/web's base URL explicitly.
const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000';

export function resolveImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${WEB_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

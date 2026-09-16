import type { PublicUser } from '@ai-commerce/types';

export const SELLER_COOKIE = 'veloura-seller-session';
export const isSeller = (user: Pick<PublicUser, 'roles'> | null) => Boolean(user?.roles.some((r) => r === 'SELLER' || r === 'SELLER_STAFF'));

export async function readSellerSession(token: string) {
  const response = await fetch(`${(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '')}/users/me`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  if (!response.ok) return null;
  const user = await response.json() as PublicUser;
  return isSeller(user) ? user : null;
}

let sessionUpdate = Promise.resolve();
export function syncSellerSession(token: string | null) {
  // Preserve request order so an in-flight refresh cannot restore the cookie after logout.
  sessionUpdate = sessionUpdate.catch(() => {}).then(async () => {
    const response = await fetch('/api/seller-session', { method: token ? 'POST' : 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error('Seller session could not be opened. Please sign in again.');
  });
  return sessionUpdate;
}

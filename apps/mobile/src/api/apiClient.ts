import { authApi, configureApiClient } from '@ai-commerce/api-client';
import { session } from './session';

// Points at the same NestJS API as apps/web — no business logic is duplicated on this side,
// per the spec's MOBILE APPLICATION rule ("Mobile must use the same backend contracts as web").
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

// The access token itself only ever needs to live in memory (it's short-lived and re-derived
// from the refresh token on every cold start) — only the longer-lived refresh token goes in
// SecureStore, via session.ts.
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

/** Also called directly by the store after a real login/register response (which returns
 *  tokens outright, not via the refresh flow above). */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** apps/api's /auth/refresh reads a body-supplied `refreshToken` as a fallback whenever the
 *  httpOnly cookie isn't present (apps/api/src/auth/auth.controller.ts, built for exactly this
 *  case) — React Native has no cookie jar, so this is the only delivery mechanism available.
 *  Must persist the *rotated* refresh token apps/api returns, not just the new access token:
 *  apps/api revokes a refresh token on use, so failing to persist the new one breaks the next
 *  refresh attempt entirely. Resolves null (never throws) on any failure, matching what
 *  packages/api-client's refreshAccessToken() expects from a configured `refresh` function. */
export async function mobileRefresh(): Promise<string | null> {
  const refreshToken = await session.getRefreshToken();
  if (!refreshToken) return null;
  try {
    const result = await authApi.refresh(refreshToken);
    await session.save(result.accessToken, result.refreshToken);
    accessToken = result.accessToken;
    return result.accessToken;
  } catch {
    return null;
  }
}

/** Called once at store module-init. `onAuthExpired` is supplied by the caller since it needs
 *  to reference the store's own `clearSession` action, which doesn't exist yet at this point. */
export function configureMobileApiClient(onAuthExpired: () => void): void {
  configureApiClient({
    getAccessToken,
    setAccessToken,
    onAuthExpired,
    refresh: mobileRefresh,
    apiBaseUrl: API_BASE_URL,
  });
}


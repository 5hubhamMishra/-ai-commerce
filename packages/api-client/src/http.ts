import type { ApiError as ApiErrorBody } from '@ai-commerce/types';

const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  code: string;
  requestId: string;
  status: number;
  details: Record<string, unknown>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = 'ApiError';
    this.code = body.error.code;
    this.requestId = body.error.requestId;
    this.status = status;
    this.details = body.error.details;
  }
}

export type ApiClientConfig = {
  getAccessToken: () => string | null;
  setAccessToken: (token: string | null) => void;
  onAuthExpired: () => void;
  /** Optional. Omitted (web's default) uses the httpOnly-cookie-based `POST /auth/refresh`
   *  below, with no body. A caller with no cookie jar (React Native) supplies its own
   *  function instead — e.g. reading a refresh token from secure storage and posting it in
   *  the body. Must call `setAccessToken` itself (and persist any rotated refresh token —
   *  apps/api revokes a refresh token on use, so failing to persist the new one breaks the
   *  *next* refresh) and resolve `null` on failure rather than throw. */
  refresh?: () => Promise<string | null>;
  /** Optional. Omitted (web's default) uses `NEXT_PUBLIC_API_URL` / the localhost fallback
   *  below. A caller on a different bundler (e.g. Expo's `EXPO_PUBLIC_API_URL`) supplies its
   *  own base URL instead. */
  apiBaseUrl?: string;
};

// Defaults to a token-less, no-op config so public (`@Public()`) endpoints work out of the
// box from anywhere — including Server Components/generateMetadata, which run before (and
// entirely without) apps/web's client-only store.ts ever executing. `configureApiClient`
// upgrades this to real token-aware behavior once the client-side store module runs.
let clientConfig: ApiClientConfig = {
  getAccessToken: () => null,
  setAccessToken: () => {},
  onAuthExpired: () => {},
};

/** One-time DI so this package stays framework/store-agnostic — apps/web's store.ts calls
 *  this once at module scope, on the client only. */
export function configureApiClient(config: ApiClientConfig): void {
  clientConfig = config;
}

export function toQueryString(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Skip the 401 refresh-and-retry loop — set on auth endpoints themselves (and on a
   *  request already being retried once) to avoid recursion. */
  skipAuthRetry?: boolean;
};

async function rawRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const token = clientConfig.getAccessToken();
  const apiUrl = (clientConfig.apiBaseUrl ?? DEFAULT_API_URL).replace(/\/+$/, '');

  const res = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    if (body?.error) throw new ApiError(res.status, body);
    throw new Error(`Request failed with status ${res.status}`);
  }

  return (await res.json()) as T;
}

/** Web's default: the refresh token travels as an httpOnly cookie, sent automatically via
 *  `credentials: 'include'` — no body needed. */
async function defaultRefresh(): Promise<string | null> {
  const result = await rawRequest<{ accessToken: string; refreshToken: string }>(
    '/auth/refresh',
    { method: 'POST', skipAuthRetry: true },
  );
  clientConfig.setAccessToken(result.accessToken);
  return result.accessToken;
}

// De-duplicated refresh: concurrent 401s share one in-flight refresh rather than each firing
// their own. apps/api's refresh rotation revokes the presented refresh token unconditionally
// and treats a second, already-revoked presentation as theft (revoking the whole session
// chain) — two independent concurrent refreshes off the same cookie/stored-token would
// trigger exactly that and force-logout the user. This guard wraps whichever refresh
// implementation is configured (default or custom), so it protects both the same way.
// Exported so callers that need a fresh token up front (e.g. a session-restore effect on
// mount) go through the same de-dup instead of firing a second, unguarded refresh that races
// this one — any caller that raced it would lose the whole session to theft-detection above.
let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (clientConfig.refresh ?? defaultRefresh)()
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && !options.skipAuthRetry) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        return rawRequest<T>(path, { ...options, skipAuthRetry: true });
      }
      clientConfig.onAuthExpired();
    }
    throw err;
  }
}

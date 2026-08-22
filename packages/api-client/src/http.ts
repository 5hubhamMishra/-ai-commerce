import type { ApiError as ApiErrorBody } from '@ai-commerce/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

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

  const res = await fetch(`${API_URL}${path}`, {
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

// De-duplicated refresh: concurrent 401s share one in-flight refresh rather than each firing
// their own. apps/api's refresh rotation revokes the presented refresh token unconditionally
// and treats a second, already-revoked presentation as theft (revoking the whole session
// chain) — two independent concurrent refreshes off the same cookie would trigger exactly
// that and force-logout the user.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = rawRequest<{ accessToken: string; refreshToken: string }>(
      '/auth/refresh',
      { method: 'POST', skipAuthRetry: true },
    )
      .then((result) => {
        clientConfig.setAccessToken(result.accessToken);
        return result.accessToken;
      })
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

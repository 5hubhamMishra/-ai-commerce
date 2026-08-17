import type { ApiError as ApiErrorBody, AuthTokens, PublicUser } from '@ai-commerce/types';

export type { PublicUser } from '@ai-commerce/types';

// Points at the same NestJS API as apps/web — no business logic is duplicated on this side,
// per the spec's MOBILE APPLICATION rule ("Mobile must use the same backend contracts as web").
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  code: string;
  requestId: string;

  constructor(body: ApiErrorBody) {
    super(body.error.message);
    this.code = body.error.code;
    this.requestId = body.error.requestId;
  }
}

async function request<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    if (body?.error) throw new ApiError(body);
    throw new Error(`Request failed with status ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type AuthResult = { user: PublicUser } & AuthTokens;

export const authApi = {
  register: (email: string, password: string, name: string) =>
    request<AuthResult>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  login: (email: string, password: string) =>
    request<AuthResult>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  refresh: (refreshToken: string) =>
    request<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
  logout: (refreshToken: string) =>
    request<void>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
};

export const usersApi = {
  me: (accessToken: string) => request<PublicUser>('/users/me', {}, accessToken),
};

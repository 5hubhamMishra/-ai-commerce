import type { PublicUser } from '@ai-commerce/types';
import { request } from './http';

export type AuthTokenResult = {
  accessToken: string;
  refreshToken: string;
};

/** `register`/`login`'s `user` field is narrower than the full `PublicUser` shape (matches
 *  `AuthService.toPublicUser()` in apps/api — no `isActive`/`createdAt`). Callers that need
 *  the canonical full record should follow up with `authApi.me()`. */
export type AuthResult = AuthTokenResult & {
  user: Pick<PublicUser, 'id' | 'email' | 'name' | 'roles'>;
};

export const authApi = {
  register: (input: { email: string; password: string; name: string }) =>
    request<AuthResult>('/auth/register', {
      method: 'POST',
      body: input,
      skipAuthRetry: true,
    }),

  login: (input: { email: string; password: string }) =>
    request<AuthResult>('/auth/login', {
      method: 'POST',
      body: input,
      skipAuthRetry: true,
    }),

  /** No args — the refresh token travels as an httpOnly cookie, sent automatically via
   *  `credentials: 'include'`. */
  refresh: () =>
    request<AuthTokenResult>('/auth/refresh', { method: 'POST', skipAuthRetry: true }),

  logout: () => request<void>('/auth/logout', { method: 'POST', skipAuthRetry: true }),

  me: () => request<PublicUser>('/users/me'),
};

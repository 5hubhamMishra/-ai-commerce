import type {
  DeleteAccountInput,
  ExportDataResponse,
  Profile,
} from '@ai-commerce/types';
import { request } from './http';

/** Privacy controls (spec PRIVACY: "data export", "account deletion") — split out from
 *  `authApi` since these aren't auth flows, they're `/users/me` operations on the signed-in
 *  account. */
export const usersApi = {
  getProfile: () => request<Profile>('/users/me/profile'),

  updateProfile: (input: Pick<Profile, 'personalizationEnabled'>) =>
    request<Profile>('/users/me/profile', { method: 'PATCH', body: input }),

  exportData: () => request<ExportDataResponse>('/users/me/export'),

  deleteAccount: (input: DeleteAccountInput) =>
    request<void>('/users/me', { method: 'DELETE', body: input }),
};

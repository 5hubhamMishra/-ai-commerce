import type { DeleteAccountInput, ExportDataResponse } from '@ai-commerce/types';
import { request } from './http';

/** Privacy controls (spec PRIVACY: "data export", "account deletion") — split out from
 *  `authApi` since these aren't auth flows, they're `/users/me` operations on the signed-in
 *  account. */
export const usersApi = {
  exportData: () => request<ExportDataResponse>('/users/me/export'),

  deleteAccount: (input: DeleteAccountInput) =>
    request<void>('/users/me', { method: 'DELETE', body: input }),
};

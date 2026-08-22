import type { GetBehavioralProfileResponse, ListActivityResponse } from '@ai-commerce/types';
import { request, toQueryString } from './http';

export const activityApi = {
  list: (query: { page?: number; pageSize?: number } = {}) =>
    request<ListActivityResponse>(`/users/me/activity${toQueryString(query)}`),

  clear: () => request<void>('/users/me/activity', { method: 'DELETE' }),

  getBehavioralProfile: () =>
    request<GetBehavioralProfileResponse>('/users/me/behavioral-profile'),
};

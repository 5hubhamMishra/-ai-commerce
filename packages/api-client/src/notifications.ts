import type { Notification } from '@ai-commerce/types';
import { request, toQueryString } from './http';

export const notificationsApi = {
  list: (unreadOnly = false) =>
    request<Notification[]>(`/notifications${toQueryString({ unreadOnly })}`),

  markRead: (id: string) =>
    request<Notification>(`/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
    }),

  markAllRead: () =>
    request<void>('/notifications/read-all', { method: 'PATCH' }),
};

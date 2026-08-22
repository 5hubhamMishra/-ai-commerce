import type { TrackEventInput, TrackEventsResponse } from '@ai-commerce/types';
import { request } from './http';

export const eventsApi = {
  track: (events: TrackEventInput[]) =>
    request<TrackEventsResponse>('/events', { method: 'POST', body: { events } }),
};

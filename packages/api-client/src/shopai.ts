import type { SendShopAIMessageInput, ShopAIConversation, ShopAIResponse } from '@ai-commerce/types';
import { request, toQueryString } from './http';

export const shopaiApi = {
  /** Every call is a real, billed LLM completion (apps/api throttles this endpoint at
   *  20/min, tighter than the app's global default) and can take several seconds — the
   *  service loops through tool calls before returning a single, non-streamed response. */
  sendMessage: (input: SendShopAIMessageInput) =>
    request<ShopAIResponse>('/shopai/message', { method: 'POST', body: input }),

  getConversation: (id: string, anonymousId?: string) =>
    request<ShopAIConversation>(
      `/shopai/conversations/${encodeURIComponent(id)}${toQueryString({ anonymousId })}`,
    ),
};

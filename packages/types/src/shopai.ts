/** Matches `SendMessageDto` in apps/api/src/shopai/dto/send-message.dto.ts. Omitting
 *  `conversationId` starts a new conversation; `anonymousId` is how a logged-out caller's
 *  conversation is owned (ignored once a real JWT is present). */
export type SendShopAIMessageInput = {
  message: string;
  conversationId?: string;
  anonymousId?: string;
};

export type ShopAIMessageRole = "user" | "assistant";

/** Matches `ShopAIResponse`'s `message` field — plain prose only, apps/api never returns
 *  structured product data (tool results are strings fed to the model, not shipped to the
 *  client; `toolActivity` below only names which tools ran, not what they returned). */
export type ShopAIMessage = {
  role: ShopAIMessageRole;
  content: string;
};

export type ShopAIToolActivity = {
  name: string;
};

/** Matches the raw return of `POST /shopai/message` (no envelope). */
export type ShopAIResponse = {
  conversationId: string;
  message: ShopAIMessage;
  toolActivity: ShopAIToolActivity[];
};

/** Matches a row from `GET /shopai/conversations/:id`'s `messages[]` — note `role` is
 *  uppercase here (`ShopAIMessage` Prisma enum), unlike `ShopAIResponse.message.role`. */
export type ShopAIConversationMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
};

export type ShopAIConversation = {
  id: string;
  createdAt: string;
  messages: ShopAIConversationMessage[];
};

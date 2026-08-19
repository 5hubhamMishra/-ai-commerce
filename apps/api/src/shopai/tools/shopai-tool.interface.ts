import type { AuthenticatedUser } from '../../common/types/authenticated-user';

export type ShopAIToolContext = {
  userId?: string;
  anonymousId?: string;
  /** Only set for a real, JWT-verified caller — required by any tool that
   *  touches account-scoped data (cart, orders). Never trust `userId` alone
   *  for that; `authenticatedUser` is the proof. */
  authenticatedUser?: AuthenticatedUser;
};

export type ShopAIToolResult = {
  /** Compact, factual text handed back to the model as the tool_result —
   *  real data only, nothing the model didn't ask for. */
  content: string;
  isError: boolean;
};

/**
 * One entry in the secure tool-calling pipeline: Allowed Tool Registry (only
 * instances registered in ShopAIModule are ever callable — the LLM cannot
 * invent a tool name) → this interface's own authorization/validation →
 * execution against real services → a sanitized result. See
 * AI_ARCHITECTURE.md's "ShopAI tool-calling security" section — this is
 * that design, implemented for real as of Phase 9, not still a diagram.
 */
export interface ShopAITool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  execute(
    input: Record<string, unknown>,
    context: ShopAIToolContext,
  ): Promise<ShopAIToolResult>;
}

export const SHOPAI_REQUIRES_LOGIN_RESULT: ShopAIToolResult = {
  content:
    'This customer is not logged in. Tell them they need to sign in to use this feature, and do not fabricate any account, cart, or order information.',
  isError: true,
};

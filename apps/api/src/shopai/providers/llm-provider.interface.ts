/**
 * Provider abstraction for the LLM behind ShopAI — same interface-plus-
 * injection-token shape as EmbeddingProvider/QueryUnderstandingProvider (see
 * DECISIONS.md ADR-015/ADR-020/ADR-023/ADR-024). The shape below is
 * deliberately provider-agnostic at the level every tool-calling chat API
 * shares (text turns, tool-call turns, tool-result turns) — not an
 * Anthropic-specific wire format — so a second adapter could be added later
 * without touching ShopAIService. Only `AnthropicLLMAdapter` exists this
 * phase; see DECISIONS.md ADR-025 for why Anthropic was the real,
 * user-confirmed choice.
 */

export type LLMToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema for the tool's input. */
  inputSchema: Record<string, unknown>;
};

export type LLMToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type LLMToolResult = {
  toolUseId: string;
  content: string;
  isError: boolean;
};

/** One turn of conversation history. A real user message, a real assistant
 *  reply, or (mid-loop, within a single request) the assistant's tool-call
 *  request and the tool results answering it. */
export type LLMTurn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls?: LLMToolCall[] }
  | { role: 'tool_results'; results: LLMToolResult[] };

export type LLMStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal';

export type LLMCompletionResult = {
  stopReason: LLMStopReason;
  /** Any assistant-visible text produced this turn (may be empty when the
   *  turn is pure tool use). */
  text: string;
  toolCalls: LLMToolCall[];
  usage: { inputTokens: number; outputTokens: number };
};

export interface LLMProvider {
  readonly model: string;
  complete(params: {
    system: string;
    history: LLMTurn[];
    tools: LLMToolDefinition[];
  }): Promise<LLMCompletionResult>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

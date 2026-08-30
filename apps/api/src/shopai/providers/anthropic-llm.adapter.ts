import { Inject, Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMCompletionResult,
  LLMProvider,
  LLMStopReason,
  LLMToolCall,
  LLMToolDefinition,
  LLMTurn,
} from './llm-provider.interface';
import { SHOPAI_CONFIG, type ShopAIConfig } from '../shopai.config';

const MAX_RESPONSE_TOKENS = 4096;
const ANTHROPIC_REQUEST_TIMEOUT_MS = 20_000;

/**
 * Real Anthropic Messages API integration (tool calling) — the model is
 * configurable (`ShopAIConfig.model`, default `claude-opus-5`), not
 * hard-coded here. `effort: "medium"` balances tool-selection quality
 * against the latency a live chat UI needs; adaptive thinking is left on
 * (not disabled) — Claude Opus 5 disables thinking cleanly only up to
 * `effort: "high"`, and disabling it at all risks a tool call arriving as
 * plain text instead of a real `tool_use` block, which would silently never
 * execute. See DECISIONS.md ADR-025.
 */
@Injectable()
export class AnthropicLLMAdapter implements LLMProvider {
  private readonly logger = new Logger(AnthropicLLMAdapter.name);
  private readonly client: Anthropic;
  readonly model: string;

  constructor(@Inject(SHOPAI_CONFIG) config: ShopAIConfig) {
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
      timeout: ANTHROPIC_REQUEST_TIMEOUT_MS,
    });
    this.model = config.model;
  }

  async complete(params: {
    system: string;
    history: LLMTurn[];
    tools: LLMToolDefinition[];
  }): Promise<LLMCompletionResult> {
    const messages = params.history.map(turnToMessageParam);
    const tools = params.tools.map(toAnthropicTool);

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_RESPONSE_TOKENS,
        output_config: { effort: 'medium' },
        system: [
          {
            type: 'text',
            text: params.system,
            // Static across every ShopAI request from every customer —
            // the highest-value possible cache breakpoint in this codebase.
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools,
        messages,
      });
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        this.logger.warn(`Anthropic rate limit hit: ${error.message}`);
      } else if (error instanceof Anthropic.APIError) {
        this.logger.error(`Anthropic API error: ${error.message}`);
      }
      throw error;
    }

    const toolCalls: LLMToolCall[] = [];
    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        });
      }
    }

    return {
      stopReason: toStopReason(response.stop_reason),
      text,
      toolCalls,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}

function toStopReason(reason: Anthropic.Message['stop_reason']): LLMStopReason {
  switch (reason) {
    case 'tool_use':
      return 'tool_use';
    // Both are genuine capacity limits, not a clean stop — ShopAIService
    // uses whatever text exists, or falls back to a clarifying message if
    // there's none, rather than silently reporting a full, clean answer.
    case 'max_tokens':
    case 'model_context_window_exceeded':
      return 'max_tokens';
    case 'refusal':
      return 'refusal';
    case 'end_turn':
    case 'stop_sequence':
    case 'pause_turn':
    default:
      return 'end_turn';
  }
}

function toAnthropicTool(tool: LLMToolDefinition): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    // Guarantees tool_use.input validates exactly against the schema —
    // every tool's schema declares additionalProperties:false + required.
    strict: true,
  };
}

function turnToMessageParam(turn: LLMTurn): Anthropic.MessageParam {
  switch (turn.role) {
    case 'user':
      return { role: 'user', content: turn.text };
    case 'assistant': {
      const content: Anthropic.ContentBlockParam[] = [];
      if (turn.text) content.push({ type: 'text', text: turn.text });
      for (const call of turn.toolCalls ?? []) {
        content.push({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: call.input,
        });
      }
      return { role: 'assistant', content };
    }
    case 'tool_results':
      return {
        role: 'user',
        content: turn.results.map((r) => ({
          type: 'tool_result',
          tool_use_id: r.toolUseId,
          content: r.content,
          is_error: r.isError,
        })),
      };
  }
}

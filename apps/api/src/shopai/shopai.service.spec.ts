import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ShopAIAnalyticsService } from './shopai-analytics.service';
import { SHOPAI_CONFIG, type ShopAIConfig } from './shopai.config';
import {
  LLM_PROVIDER,
  type LLMCompletionResult,
} from './providers/llm-provider.interface';
import type {
  ShopAITool,
  ShopAIToolResult,
} from './tools/shopai-tool.interface';
import { SHOPAI_TOOLS } from './tools/shopai-tools.token';
import { ShopAIService } from './shopai.service';

/** Returns the tool (interface-typed, for the DI array) alongside its own
 *  jest.fn() reference (plain-typed, so assertions on it don't trip
 *  @typescript-eslint/unbound-method — that rule treats the interface's
 *  method-shorthand `execute(...)` as a bindable class method, even though
 *  the runtime value here is just a mock function). */
function fakeTool(
  name: string,
  result: ShopAIToolResult,
): { tool: ShopAITool; execute: jest.Mock } {
  const execute = jest.fn().mockResolvedValue(result);
  return {
    tool: {
      name,
      description: `fake ${name}`,
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
      execute,
    },
    execute,
  };
}

function endTurn(text: string): LLMCompletionResult {
  return {
    stopReason: 'end_turn',
    text,
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 5 },
  };
}

function toolUse(
  toolCalls: { id: string; name: string; input: Record<string, unknown> }[],
): LLMCompletionResult {
  return {
    stopReason: 'tool_use',
    text: '',
    toolCalls,
    usage: { inputTokens: 20, outputTokens: 15 },
  };
}

describe('ShopAIService', () => {
  let service: ShopAIService;
  let prisma: {
    shopAIConversation: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    shopAIMessage: { create: jest.Mock; findMany: jest.Mock };
  };
  let llm: { model: string; complete: jest.Mock };
  let analytics: { logInteraction: jest.Mock };
  let tools: ShopAITool[];
  let searchProductsExecute: jest.Mock;

  const config: ShopAIConfig = {
    anthropicApiKey: 'test-key',
    model: 'claude-opus-5',
    maxToolIterations: 3,
  };

  beforeEach(async () => {
    prisma = {
      shopAIConversation: {
        create: jest.fn().mockResolvedValue({
          id: 'conv-1',
          userId: undefined,
          anonymousId: undefined,
        }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      shopAIMessage: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    llm = { model: 'claude-opus-5', complete: jest.fn() };
    analytics = { logInteraction: jest.fn().mockResolvedValue(undefined) };
    const searchTool = fakeTool('search_products', {
      content: 'found stuff',
      isError: false,
    });
    tools = [searchTool.tool];
    searchProductsExecute = searchTool.execute;

    const module = await Test.createTestingModule({
      providers: [
        ShopAIService,
        { provide: PrismaService, useValue: prisma },
        { provide: ShopAIAnalyticsService, useValue: analytics },
        { provide: SHOPAI_CONFIG, useValue: config },
        { provide: LLM_PROVIDER, useValue: llm },
        { provide: SHOPAI_TOOLS, useValue: tools },
      ],
    }).compile();

    service = module.get(ShopAIService);
  });

  it('creates a new conversation when no conversationId is given', async () => {
    llm.complete.mockResolvedValue(endTurn('Hi, how can I help?'));

    const result = await service.sendMessage(
      { message: 'hello' },
      { anonymousId: 'anon-1' },
    );

    expect(result.conversationId).toBe('conv-1');
    expect(prisma.shopAIConversation.create).toHaveBeenCalledWith({
      data: { userId: undefined, anonymousId: 'anon-1' },
    });
  });

  it('rejects continuing a conversation that belongs to someone else (IDOR)', async () => {
    prisma.shopAIConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      userId: 'other-user',
      anonymousId: null,
    });

    await expect(
      service.sendMessage(
        { conversationId: 'conv-1', message: 'hi' },
        { authenticatedUser: { id: 'me', email: 'me@example.com', roles: [] } },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('allows continuing a conversation owned by the caller (userId match)', async () => {
    prisma.shopAIConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      userId: 'me',
      anonymousId: null,
    });
    llm.complete.mockResolvedValue(endTurn('Sure, continuing.'));

    const result = await service.sendMessage(
      { conversationId: 'conv-1', message: 'follow up' },
      { authenticatedUser: { id: 'me', email: 'me@example.com', roles: [] } },
    );

    expect(result.conversationId).toBe('conv-1');
    expect(prisma.shopAIConversation.create).not.toHaveBeenCalled();
  });

  it('allows continuing an anonymous conversation via anonymousId match', async () => {
    prisma.shopAIConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      userId: null,
      anonymousId: 'anon-1',
    });
    llm.complete.mockResolvedValue(endTurn('Sure.'));

    const result = await service.sendMessage(
      { conversationId: 'conv-1', message: 'hi again' },
      { anonymousId: 'anon-1' },
    );

    expect(result.conversationId).toBe('conv-1');
  });

  it('executes a tool the model requests and feeds the result back', async () => {
    llm.complete
      .mockResolvedValueOnce(
        toolUse([
          {
            id: 'call-1',
            name: 'search_products',
            input: { query: 'headphones' },
          },
        ]),
      )
      .mockResolvedValueOnce(endTurn('Here is what I found.'));

    const result = await service.sendMessage(
      { message: 'find headphones' },
      { anonymousId: 'anon-1' },
    );

    expect(searchProductsExecute).toHaveBeenCalledWith(
      { query: 'headphones' },
      expect.objectContaining({ anonymousId: 'anon-1' }),
    );
    expect(result.toolActivity).toEqual([{ name: 'search_products' }]);
    expect(result.message.content).toBe('Here is what I found.');
  });

  it('rejects a tool name outside the allowed registry without executing anything', async () => {
    llm.complete
      .mockResolvedValueOnce(
        toolUse([{ id: 'call-1', name: 'delete_everything', input: {} }]),
      )
      .mockResolvedValueOnce(endTurn('Never mind.'));

    const result = await service.sendMessage(
      { message: 'do something' },
      { anonymousId: 'anon-1' },
    );

    expect(searchProductsExecute).not.toHaveBeenCalled();
    expect(result.toolActivity).toEqual([]);
  });

  it('stops after the configured max tool iterations rather than looping forever', async () => {
    llm.complete.mockResolvedValue(
      toolUse([{ id: 'call-1', name: 'search_products', input: {} }]),
    );

    await service.sendMessage(
      { message: 'loop forever' },
      { anonymousId: 'anon-1' },
    );

    expect(llm.complete).toHaveBeenCalledTimes(config.maxToolIterations);
  });

  it('returns a safe fallback message and logs refused:true on a refusal', async () => {
    llm.complete.mockResolvedValue({
      stopReason: 'refusal',
      text: '',
      toolCalls: [],
      usage: { inputTokens: 5, outputTokens: 0 },
    });

    const result = await service.sendMessage(
      { message: 'something unsafe' },
      { anonymousId: 'anon-1' },
    );

    expect(result.message.content).toMatch(/can't help/i);
    expect(analytics.logInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ refused: true }),
    );
  });

  it('falls back to a clarifying message when the model ends with no text', async () => {
    llm.complete.mockResolvedValue(endTurn(''));

    const result = await service.sendMessage(
      { message: 'hi' },
      { anonymousId: 'anon-1' },
    );

    expect(result.message.content.length).toBeGreaterThan(0);
  });

  it('logs aggregated token usage across multiple tool-loop iterations', async () => {
    llm.complete
      .mockResolvedValueOnce(
        toolUse([{ id: 'call-1', name: 'search_products', input: {} }]),
      )
      .mockResolvedValueOnce(endTurn('Done.'));

    await service.sendMessage(
      { message: 'find something' },
      { anonymousId: 'anon-1' },
    );

    expect(analytics.logInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 20 + 10, outputTokens: 15 + 5 }),
    );
  });
});

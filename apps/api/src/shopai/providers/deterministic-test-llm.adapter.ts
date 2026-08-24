import type {
  LLMCompletionResult,
  LLMProvider,
  LLMToolDefinition,
  LLMTurn,
} from './llm-provider.interface';

export class DeterministicTestLLMAdapter implements LLMProvider {
  readonly model = 'deterministic-test';

  readonly calls: {
    system: string;
    history: LLMTurn[];
    tools: LLMToolDefinition[];
  }[] = [];

  constructor(private readonly completions: LLMCompletionResult[]) {}

  complete(params: {
    system: string;
    history: LLMTurn[];
    tools: LLMToolDefinition[];
  }): Promise<LLMCompletionResult> {
    this.calls.push(params);
    const next = this.completions.shift();
    if (!next) {
      throw new Error('No deterministic LLM completion queued.');
    }
    return Promise.resolve(next);
  }
}

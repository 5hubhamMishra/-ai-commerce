import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingModel } from '@prisma/client';
import { STORED_EMBEDDING_DIMENSIONS } from '../embedding-model-config';
import type {
  EmbeddingInput,
  EmbeddingProvider,
  EmbeddingResult,
} from './embedding-provider.interface';

const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
const OPENAI_REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class OpenAIEmbeddingAdapter implements EmbeddingProvider {
  readonly model = EmbeddingModel.OPENAI_TEXT_EMBEDDING_3_SMALL;
  readonly dimensions = STORED_EMBEDDING_DIMENSIONS;

  constructor(private readonly config: ConfigService) {}

  embed(input: EmbeddingInput): Promise<EmbeddingResult> {
    return this.request(productText(input)).then(([result]) => result);
  }

  embedMany(inputs: EmbeddingInput[]): Promise<EmbeddingResult[]> {
    return this.request(inputs.map(productText));
  }

  embedText(text: string): Promise<EmbeddingResult> {
    return this.request(text).then(([result]) => result);
  }

  private async request(input: string | string[]): Promise<EmbeddingResult[]> {
    const apiKey = this.config.get<string>('embeddings.openaiApiKey');
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_EMBEDDING_MODEL,
        input,
        dimensions: STORED_EMBEDDING_DIMENSIONS,
        encoding_format: 'float',
      }),
      signal: AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`OpenAI embedding request failed (${response.status})`);
    }

    const body: unknown = await response.json();
    const data =
      typeof body === 'object' && body !== null && 'data' in body
        ? (body as { data?: unknown }).data
        : undefined;
    const embeddings = Array.isArray(data)
      ? data.map((item) => {
          const embedding =
            item && typeof item === 'object' && 'embedding' in item
              ? (item as { embedding?: unknown }).embedding
              : undefined;
          if (
            !Array.isArray(embedding) ||
            !embedding.every(
              (value): value is number => typeof value === 'number',
            )
          ) {
            throw new Error('OpenAI embedding response had no numeric vector');
          }
          return { vector: embedding };
        })
      : [];
    const expectedCount = Array.isArray(input) ? input.length : 1;
    if (embeddings.length !== expectedCount) {
      throw new Error('OpenAI embedding response count did not match input');
    }
    return embeddings;
  }
}

function productText(input: EmbeddingInput): string {
  return `${input.name}\n${input.description}\n${input.tags.join(' ')}\n${input.specificationValues.join(' ')}`;
}

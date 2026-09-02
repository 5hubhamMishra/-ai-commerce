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

@Injectable()
export class OpenAIEmbeddingAdapter implements EmbeddingProvider {
  readonly model = EmbeddingModel.OPENAI_TEXT_EMBEDDING_3_SMALL;
  readonly dimensions = STORED_EMBEDDING_DIMENSIONS;

  constructor(private readonly config: ConfigService) {}

  embed(input: EmbeddingInput): Promise<EmbeddingResult> {
    return this.request(
      `${input.name}\n${input.description}\n${input.tags.join(' ')}\n${input.specificationValues.join(' ')}`,
    );
  }

  embedText(text: string): Promise<EmbeddingResult> {
    return this.request(text);
  }

  private async request(input: string): Promise<EmbeddingResult> {
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
    });
    if (!response.ok) {
      throw new Error(`OpenAI embedding request failed (${response.status})`);
    }

    const body: unknown = await response.json();
    const data =
      typeof body === 'object' && body !== null && 'data' in body
        ? (body as { data?: unknown }).data
        : undefined;
    const first = Array.isArray(data) ? (data as unknown[])[0] : undefined;
    const embedding =
      first && typeof first === 'object' && 'embedding' in first
        ? (first as { embedding?: unknown }).embedding
        : undefined;
    if (
      !Array.isArray(embedding) ||
      !embedding.every((value): value is number => typeof value === 'number')
    ) {
      throw new Error('OpenAI embedding response had no numeric vector');
    }
    return { vector: embedding };
  }
}

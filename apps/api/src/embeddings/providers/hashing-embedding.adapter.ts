import { Injectable } from '@nestjs/common';
import { STORED_EMBEDDING_DIMENSIONS } from '../embedding-model-config';
import { EmbeddingModel } from '@prisma/client';
import type {
  EmbeddingInput,
  EmbeddingProvider,
  EmbeddingResult,
} from './embedding-provider.interface';

const DIMENSIONS = STORED_EMBEDDING_DIMENSIONS;
/** Category/brand tokens get more weight than a plain word — they're the
 *  strongest, least noisy same-product-family signal available without a
 *  real trained model. */
const STRUCTURED_TOKEN_WEIGHT = 3;
const TEXT_TOKEN_WEIGHT = 1;

/** FNV-1a — fast, deterministic, good bit dispersion for short strings.
 *  Not cryptographic; doesn't need to be. */
function fnv1a(token: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/**
 * A real, deterministic "feature hashing" embedding (the same technique
 * behind e.g. Vowpal Wabbit's hashing trick) — not a trained ML model, but
 * genuinely computed from product content, not fabricated (spec: "Do not
 * fake recommendation results"). Each token (from name/description/tags/
 * specifications, plus category/brand as structured tokens) is hashed into
 * one of `dimensions` buckets; the hash's low bit picks a sign, so unrelated
 * tokens partially cancel rather than only ever adding — standard practice
 * for hashed features, reduces collision bias. The result is L2-normalized
 * so cosine similarity behaves the way callers expect (1 = identical
 * direction, 0 = unrelated, -1 = opposite).
 */
function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return norm > 0 ? vector.map((v) => v / norm) : vector;
}

@Injectable()
export class HashingEmbeddingAdapter implements EmbeddingProvider {
  readonly model = EmbeddingModel.HASHING_V1;
  readonly dimensions = DIMENSIONS;

  embed(input: EmbeddingInput): Promise<EmbeddingResult> {
    const vector = new Array<number>(DIMENSIONS).fill(0);

    const addToken = (token: string, weight: number) => {
      const hash = fnv1a(token);
      const bucket = hash % DIMENSIONS;
      const sign = hash & 1 ? 1 : -1;
      vector[bucket] += sign * weight;
    };

    addToken(`category:${input.categoryId}`, STRUCTURED_TOKEN_WEIGHT);
    if (input.brandId)
      addToken(`brand:${input.brandId}`, STRUCTURED_TOKEN_WEIGHT);
    for (const tag of input.tags)
      addToken(`tag:${tag.toLowerCase()}`, STRUCTURED_TOKEN_WEIGHT);

    const text = `${input.name} ${input.description} ${input.specificationValues.join(' ')}`;
    for (const token of tokenize(text)) addToken(token, TEXT_TOKEN_WEIGHT);

    return Promise.resolve({ vector: l2Normalize(vector) });
  }

  /** A search-box query has no category/brand/tag fields — just plain text,
   *  hashed the exact same way `embed()` hashes name/description/specs, so a
   *  query and a product land in the same space and share literal tokens
   *  (e.g. "wireless headphones" vs. a product whose name contains both
   *  words) score highly. Structural tokens (category:/brand:/tag:) are
   *  deliberately not added here — SearchService applies category/brand as
   *  real metadata filters instead, using the extracted values from
   *  RuleBasedQueryUnderstandingAdapter, not a fuzzy embedding guess. */
  embedText(text: string): Promise<EmbeddingResult> {
    const vector = new Array<number>(DIMENSIONS).fill(0);
    for (const token of tokenize(text)) {
      const hash = fnv1a(token);
      const bucket = hash % DIMENSIONS;
      const sign = hash & 1 ? 1 : -1;
      vector[bucket] += sign * TEXT_TOKEN_WEIGHT;
    }
    return Promise.resolve({ vector: l2Normalize(vector) });
  }
}

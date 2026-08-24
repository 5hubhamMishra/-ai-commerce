import { EmbeddingModel } from '@prisma/client';

// WP-09 guardrail: the database column is currently `vector(64)` and the only
// persisted model is HASHING_V1. A hosted embedding model migration must add a
// new enum value plus a matching pgvector column/index or replacement table and
// backfill plan before changing either constant.
export const STORED_EMBEDDING_MODEL = EmbeddingModel.HASHING_V1;
export const STORED_EMBEDDING_DIMENSIONS = 64;

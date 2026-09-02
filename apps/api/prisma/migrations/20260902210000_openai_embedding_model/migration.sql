-- Add the opt-in hosted embedding model. Both providers use vector(64), while
-- EmbeddingsService scopes reads by model so existing hashing rows remain valid
-- until an explicit reindexAll backfill is run.
ALTER TYPE "EmbeddingModel" ADD VALUE 'OPENAI_TEXT_EMBEDDING_3_SMALL';

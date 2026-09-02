// Both supported providers use 64 dimensions, so they can share the existing
// pgvector column. EmbeddingsService scopes every query by the provider model;
// hashing and hosted vectors are never compared with one another.
export const STORED_EMBEDDING_DIMENSIONS = 64;

-- Phase 8 (AI Semantic Search): enable pgvector, move product_embeddings.vector
-- from a plain double-precision[] column to a real pgvector column with an
-- HNSW cosine-ops index, and add search_query_logs for search analytics.
--
-- The 112 existing embedding values are dropped by the AlterTable below and
-- are NOT reconstructable from this migration alone — EmbeddingsService.reindexAll()
-- must be run immediately after this migration deploys to repopulate them
-- (deterministic recompute from product content, not a backup/restore concern;
-- same "recompute rather than trust a risky data migration" choice as prior
-- phases made for other non-critical derived data).

CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "product_embeddings" DROP COLUMN "vector",
ADD COLUMN     "embedding" vector(64);

-- CreateIndex (HNSW: pgvector 0.5.0+; this environment runs 0.8.6 — see
-- DECISIONS.md ADR-024. Cosine ops to match EmbeddingsService's `<=>` usage,
-- consistent with the hashing adapter's L2-normalized output.)
CREATE INDEX "product_embeddings_embedding_hnsw_idx" ON "product_embeddings" USING hnsw ("embedding" vector_cosine_ops);

-- CreateTable
CREATE TABLE "search_query_logs" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "result_count" INTEGER NOT NULL,
    "used_semantic" BOOLEAN NOT NULL,
    "user_id" TEXT,
    "anonymous_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_query_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_query_logs_user_id_idx" ON "search_query_logs"("user_id");

-- CreateIndex
CREATE INDEX "search_query_logs_anonymous_id_idx" ON "search_query_logs"("anonymous_id");

-- CreateIndex
CREATE INDEX "search_query_logs_created_at_idx" ON "search_query_logs"("created_at");

-- AddForeignKey
ALTER TABLE "search_query_logs" ADD CONSTRAINT "search_query_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

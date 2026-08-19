-- Phase 9 (ShopAI): conversation history + AI observability log.
--
-- NOTE: `prisma migrate diff` against this schema also proposed
-- `DROP INDEX "product_embeddings_embedding_hnsw_idx"` — a false positive.
-- Prisma has no way to represent a raw-SQL index on an `Unsupported()`
-- pgvector column in its schema model, so its diff engine sees an index it
-- doesn't recognize and assumes it shouldn't be there. That line has been
-- removed from this migration; the Phase 8 HNSW index is untouched. Read
-- the generated SQL before applying it, every time — same discipline that
-- caught Phase 5's business_name mapping bug.

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "shopai_conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "anonymous_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopai_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopai_interaction_logs" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT,
    "anonymous_id" TEXT,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "tool_call_count" INTEGER NOT NULL,
    "tool_names" TEXT[],
    "latency_ms" INTEGER NOT NULL,
    "stop_reason" TEXT NOT NULL,
    "refused" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopai_interaction_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shopai_conversations_user_id_idx" ON "shopai_conversations"("user_id");

-- CreateIndex
CREATE INDEX "shopai_conversations_anonymous_id_idx" ON "shopai_conversations"("anonymous_id");

-- CreateIndex
CREATE INDEX "shopai_messages_conversation_id_idx" ON "shopai_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "shopai_interaction_logs_conversation_id_idx" ON "shopai_interaction_logs"("conversation_id");

-- CreateIndex
CREATE INDEX "shopai_interaction_logs_user_id_idx" ON "shopai_interaction_logs"("user_id");

-- CreateIndex
CREATE INDEX "shopai_interaction_logs_created_at_idx" ON "shopai_interaction_logs"("created_at");

-- AddForeignKey
ALTER TABLE "shopai_conversations" ADD CONSTRAINT "shopai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopai_messages" ADD CONSTRAINT "shopai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "shopai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopai_interaction_logs" ADD CONSTRAINT "shopai_interaction_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

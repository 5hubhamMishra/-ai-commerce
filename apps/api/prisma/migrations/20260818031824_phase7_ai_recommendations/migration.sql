-- CreateEnum
CREATE TYPE "EmbeddingModel" AS ENUM ('HASHING_V1');

-- CreateEnum
CREATE TYPE "RecommendationContext" AS ENUM ('HOMEPAGE', 'SIMILAR_PRODUCTS', 'FREQUENTLY_BOUGHT_WITH', 'TRENDING');

-- CreateTable
CREATE TABLE "product_embeddings" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "vector" DOUBLE PRECISION[],
    "model" "EmbeddingModel" NOT NULL DEFAULT 'HASHING_V1',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_impressions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "anonymous_id" TEXT,
    "product_id" TEXT NOT NULL,
    "context" "RecommendationContext" NOT NULL,
    "position" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_impressions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_embeddings_product_id_key" ON "product_embeddings"("product_id");

-- CreateIndex
CREATE INDEX "recommendation_impressions_user_id_idx" ON "recommendation_impressions"("user_id");

-- CreateIndex
CREATE INDEX "recommendation_impressions_anonymous_id_idx" ON "recommendation_impressions"("anonymous_id");

-- CreateIndex
CREATE INDEX "recommendation_impressions_product_id_idx" ON "recommendation_impressions"("product_id");

-- CreateIndex
CREATE INDEX "recommendation_impressions_created_at_idx" ON "recommendation_impressions"("created_at");

-- AddForeignKey
ALTER TABLE "product_embeddings" ADD CONSTRAINT "product_embeddings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_impressions" ADD CONSTRAINT "recommendation_impressions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_impressions" ADD CONSTRAINT "recommendation_impressions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

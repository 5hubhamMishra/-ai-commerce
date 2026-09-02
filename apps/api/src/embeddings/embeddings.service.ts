import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STORED_EMBEDDING_DIMENSIONS } from './embedding-model-config';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingInput,
  type EmbeddingProvider,
} from './providers/embedding-provider.interface';

export type SimilarProduct = { productId: string; similarity: number };
const EMBEDDING_BATCH_SIZE = 32;

type EmbeddableProduct = {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  brandId: string | null;
  tags: { tag: { name: string } }[];
  specifications: { value: string }[];
};

function toEmbeddingInput(product: EmbeddableProduct): EmbeddingInput {
  return {
    productId: product.id,
    name: product.name,
    description: product.description,
    categoryId: product.categoryId,
    brandId: product.brandId,
    tags: product.tags.map((tag) => tag.tag.name),
    specificationValues: product.specifications.map((spec) => spec.value),
  };
}

function vectorToLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

class EmbeddingCompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingCompatibilityError';
  }
}

/**
 * Computes, stores, and compares product embeddings. Similarity search is a
 * real pgvector nearest-neighbor query (HNSW cosine-ops index — see the
 * Phase 8 migration) since Phase 8; it was a plain in-process cosine scan
 * over a `Float[]` column through Phase 7 (see DECISIONS.md ADR-023/ADR-024).
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_PROVIDER)
    private readonly provider: EmbeddingProvider,
  ) {}

  async reindexProduct(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        tags: { include: { tag: true } },
        specifications: true,
      },
    });
    if (!product || product.deletedAt) {
      // Soft-deleted/gone — drop any stale embedding rather than leaving
      // one that could still surface in similarity results.
      await this.prisma.productEmbedding
        .delete({ where: { productId } })
        .catch(() => undefined);
      return;
    }

    const { vector } = await this.provider.embed(toEmbeddingInput(product));
    await this.storeEmbedding(product.id, vector);
  }

  private async storeEmbedding(productId: string, vector: number[]) {
    await this.prisma.$transaction(this.embeddingOperations(productId, vector));
  }

  private async storeEmbeddingBatch(
    products: EmbeddableProduct[],
    results: { vector: number[] }[],
  ) {
    if (results.length !== products.length) {
      throw new Error('Embedding provider vector count did not match products');
    }
    const operations = products.flatMap((product, index) => {
      const result = results[index];
      return this.embeddingOperations(product.id, result.vector);
    });
    await this.prisma.$transaction(operations);
  }

  private embeddingOperations(productId: string, vector: number[]) {
    this.assertCompatibleVector(vector);
    const literal = vectorToLiteral(vector);

    // `embedding` is an `Unsupported("vector(64)")` column — Prisma Client
    // can't write it directly, so the row's other fields go through the
    // normal upsert and the vector itself through raw SQL, both in one
    // transaction so a crash between the two can never leave a
    // metadata-only row with no vector.
    return [
      this.prisma.productEmbedding.upsert({
        where: { productId },
        create: { productId, model: this.provider.model },
        update: { model: this.provider.model },
      }),
      this.prisma.$executeRaw`
        UPDATE product_embeddings SET embedding = ${literal}::vector
        WHERE product_id = ${productId}
      `,
    ];
  }

  /** Batch reindex — the initial backfill for products seeded before this
   *  phase existed, and a manual recovery tool if the embedding model ever
   *  changes. Provider requests are batched to keep hosted backfills within
   *  serverless request limits; writes stay sequential and transactional. */
  async reindexAll(): Promise<{ productCount: number }> {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      include: {
        tags: { include: { tag: true } },
        specifications: true,
      },
    });
    for (
      let offset = 0;
      offset < products.length;
      offset += EMBEDDING_BATCH_SIZE
    ) {
      const batch = products.slice(offset, offset + EMBEDDING_BATCH_SIZE);
      const results = await this.provider.embedMany(
        batch.map(toEmbeddingInput),
      );
      await this.storeEmbeddingBatch(batch, results);
    }
    this.logger.log(`Reindexed embeddings for ${products.length} products`);
    return { productCount: products.length };
  }

  async findSimilar(
    productId: string,
    limit: number,
    excludeIds: Set<string> = new Set(),
  ): Promise<SimilarProduct[]> {
    let literal: string | null;
    try {
      const target = await this.prisma.$queryRaw<
        { embedding: string | null }[]
      >`
        SELECT embedding::text AS embedding
        FROM product_embeddings
        WHERE product_id = ${productId}
          AND model::text = ${this.provider.model}
      `;
      literal = target[0]?.embedding ?? null;
    } catch (error) {
      this.logger.warn(
        `Failed to look up embedding for product ${productId}, degrading to no similar results: ${String(error)}`,
      );
      return [];
    }
    if (!literal) return [];
    return this.similarByLiteral(literal, limit, [productId, ...excludeIds]);
  }

  /** Semantic search's entry point — embeds free text (a search-box query)
   *  the same way a product is embedded and finds its nearest neighbors.
   *  Used by SearchService, never a stored ProductEmbedding row itself. */
  async findSimilarToText(
    text: string,
    limit: number,
    excludeIds: string[] = [],
  ): Promise<SimilarProduct[]> {
    try {
      const { vector } = await this.provider.embedText(text);
      this.assertCompatibleVector(vector);
      return this.similarByLiteral(vectorToLiteral(vector), limit, excludeIds);
    } catch (error) {
      this.logger.warn(
        `Query embedding failed compatibility validation, degrading to no semantic results: ${String(error)}`,
      );
      return [];
    }
  }

  /** Real pgvector nearest-neighbor query (the HNSW cosine-ops index from
   *  the Phase 8 migration) — `<=>` is pgvector's cosine *distance*
   *  (0 = identical direction, 2 = opposite), so similarity is `1 - distance`
   *  to keep the same -1..1 meaning EmbeddingsService always returned.
   *  Deliberately fails soft: spec requires search to "remain functional if
   *  the AI service is unavailable" — a pgvector error degrades semantic
   *  results to empty rather than 500ing the caller (SearchService falls
   *  back to keyword-only; RecommendationsService's content-similarity
   *  signal simply drops out of the blend for that request). */
  private async similarByLiteral(
    literal: string,
    limit: number,
    excludeIds: string[],
  ): Promise<SimilarProduct[]> {
    try {
      const rows = await this.prisma.$queryRaw<
        { product_id: string; similarity: number }[]
      >(
        Prisma.sql`
          SELECT product_id, 1 - (embedding <=> ${literal}::vector) AS similarity
          FROM product_embeddings
          WHERE embedding IS NOT NULL
            AND model::text = ${this.provider.model}
          ${excludeIds.length ? Prisma.sql`AND product_id NOT IN (${Prisma.join(excludeIds)})` : Prisma.empty}
          ORDER BY embedding <=> ${literal}::vector
          LIMIT ${limit}
        `,
      );
      return rows.map((r) => ({
        productId: r.product_id,
        similarity: r.similarity,
      }));
    } catch (error) {
      this.logger.warn(
        `Similarity query failed, degrading to no semantic results: ${String(error)}`,
      );
      return [];
    }
  }

  private assertCompatibleVector(vector: number[]) {
    if (this.provider.dimensions !== STORED_EMBEDDING_DIMENSIONS) {
      throw new EmbeddingCompatibilityError(
        `Embedding provider declares ${this.provider.dimensions} dimensions, but the store is vector(${STORED_EMBEDDING_DIMENSIONS}).`,
      );
    }

    if (vector.length !== STORED_EMBEDDING_DIMENSIONS) {
      throw new EmbeddingCompatibilityError(
        `Embedding vector has ${vector.length} dimensions, but the store is vector(${STORED_EMBEDDING_DIMENSIONS}).`,
      );
    }

    if (!vector.every(Number.isFinite)) {
      throw new EmbeddingCompatibilityError(
        'Embedding vector contains a non-finite value.',
      );
    }
  }
}

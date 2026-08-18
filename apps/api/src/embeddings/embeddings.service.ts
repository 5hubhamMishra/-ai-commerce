import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from './providers/embedding-provider.interface';

export type SimilarProduct = { productId: string; similarity: number };

/**
 * Computes, stores, and compares product embeddings. Similarity search is a
 * plain in-process cosine-similarity scan over every stored embedding, not
 * an indexed nearest-neighbor query — genuinely fine at this catalog's scale
 * (112 products; see schema.prisma's `ProductEmbedding` doc comment and
 * DECISIONS.md ADR-023 for why this isn't pgvector yet).
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

    const { vector } = await this.provider.embed({
      productId: product.id,
      name: product.name,
      description: product.description,
      categoryId: product.categoryId,
      brandId: product.brandId,
      tags: product.tags.map((t) => t.tag.name),
      specificationValues: product.specifications.map((s) => s.value),
    });

    await this.prisma.productEmbedding.upsert({
      where: { productId },
      create: { productId, vector },
      update: { vector },
    });
  }

  /** Batch reindex — the initial backfill for products seeded before this
   *  phase existed, and a manual recovery tool if the embedding model ever
   *  changes. Sequential, not `Promise.all` — this is an infrequent admin
   *  action, not a request-path hot loop, and sequential keeps a single
   *  slow/failing product from taking down a `Promise.all` batch. */
  async reindexAll(): Promise<{ productCount: number }> {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    for (const p of products) {
      await this.reindexProduct(p.id);
    }
    this.logger.log(`Reindexed embeddings for ${products.length} products`);
    return { productCount: products.length };
  }

  async findSimilar(
    productId: string,
    limit: number,
    excludeIds: Set<string> = new Set(),
  ): Promise<SimilarProduct[]> {
    const target = await this.prisma.productEmbedding.findUnique({
      where: { productId },
    });
    if (!target) return [];

    const all = await this.prisma.productEmbedding.findMany({
      where: { productId: { not: productId } },
    });

    const scored = all
      .filter((e) => !excludeIds.has(e.productId))
      .map((e) => ({
        productId: e.productId,
        similarity: cosineSimilarity(target.vector, e.vector),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return scored;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  // Both vectors are already L2-normalized by the provider, so the dot
  // product alone is the cosine similarity — no need to re-divide by norms.
  return dot;
}

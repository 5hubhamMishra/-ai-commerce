import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from './providers/embedding-provider.interface';

/** Spec requirement (PROMPT 09): "search must remain functional if the AI
 *  service is unavailable." Proven here at the unit level, deterministically
 *  — a live e2e test would need to actually break the shared dev database's
 *  pgvector extension to exercise this path, which isn't worth the risk to
 *  shared infrastructure just to prove a try/catch works. */
describe('EmbeddingsService graceful degradation', () => {
  async function buildService(queryRawImpl: () => Promise<unknown>) {
    const provider: EmbeddingProvider = {
      dimensions: 64,
      embed: jest.fn(),
      embedText: jest.fn().mockResolvedValue({ vector: [0.1, 0.2, 0.3] }),
    };
    const prisma: { $queryRaw: jest.Mock } = {
      $queryRaw: jest.fn(queryRawImpl),
    };

    const module = await Test.createTestingModule({
      providers: [
        EmbeddingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EMBEDDING_PROVIDER, useValue: provider },
      ],
    }).compile();

    return module.get(EmbeddingsService);
  }

  it('findSimilarToText degrades to an empty array instead of throwing when the pgvector query fails', async () => {
    const service = await buildService(() =>
      Promise.reject(new Error('pgvector unavailable')),
    );
    await expect(
      service.findSimilarToText('wireless headphones', 5),
    ).resolves.toEqual([]);
  });

  it('findSimilar degrades to an empty array when the target lookup itself fails', async () => {
    const service = await buildService(() =>
      Promise.reject(new Error('connection lost')),
    );
    await expect(service.findSimilar('product-1', 5)).resolves.toEqual([]);
  });

  it('findSimilar returns an empty array when the product has no stored embedding', async () => {
    const service = await buildService(() => Promise.resolve([]));
    await expect(service.findSimilar('product-1', 5)).resolves.toEqual([]);
  });
});

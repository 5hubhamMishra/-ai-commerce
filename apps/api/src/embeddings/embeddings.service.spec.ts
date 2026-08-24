import { Test } from '@nestjs/testing';
import { EmbeddingModel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  STORED_EMBEDDING_DIMENSIONS,
  STORED_EMBEDDING_MODEL,
} from './embedding-model-config';
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
  const vector64 = new Array<number>(STORED_EMBEDDING_DIMENSIONS).fill(0.125);

  async function buildService(queryRawImpl: () => Promise<unknown>) {
    const provider: EmbeddingProvider = {
      model: STORED_EMBEDDING_MODEL,
      dimensions: STORED_EMBEDDING_DIMENSIONS,
      embed: jest.fn(),
      embedText: jest.fn().mockResolvedValue({ vector: vector64 }),
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

  it('findSimilarToText degrades when the query provider returns the wrong dimensionality', async () => {
    const provider: EmbeddingProvider = {
      model: STORED_EMBEDDING_MODEL,
      dimensions: STORED_EMBEDDING_DIMENSIONS,
      embed: jest.fn(),
      embedText: jest.fn().mockResolvedValue({ vector: [0.1, 0.2, 0.3] }),
    };
    const prisma: { $queryRaw: jest.Mock } = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ product_id: 'product-1', similarity: 0.9 }]),
    };

    const module = await Test.createTestingModule({
      providers: [
        EmbeddingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EMBEDDING_PROVIDER, useValue: provider },
      ],
    }).compile();

    const service = module.get(EmbeddingsService);
    await expect(service.findSimilarToText('wireless', 5)).resolves.toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('EmbeddingsService compatibility guards', () => {
  const compatibleVector = new Array<number>(STORED_EMBEDDING_DIMENSIONS).fill(
    0,
  );
  compatibleVector[0] = 1;

  async function buildReindexService(provider: EmbeddingProvider) {
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'product-1',
          name: 'Wireless Headphones',
          description: 'Noise cancelling headphones',
          categoryId: 'cat-1',
          brandId: 'brand-1',
          deletedAt: null,
          tags: [{ tag: { name: 'audio' } }],
          specifications: [{ value: 'Bluetooth' }],
        }),
      },
      productEmbedding: {
        delete: jest.fn(),
        upsert: jest.fn().mockReturnValue({ op: 'upsert' }),
      },
      $executeRaw: jest.fn().mockReturnValue({ op: 'execute' }),
      $transaction: jest.fn().mockResolvedValue([]),
    };

    const module = await Test.createTestingModule({
      providers: [
        EmbeddingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EMBEDDING_PROVIDER, useValue: provider },
      ],
    }).compile();

    return { service: module.get(EmbeddingsService), prisma };
  }

  it('stores the provider model when reindexing a compatible product embedding', async () => {
    const provider: EmbeddingProvider = {
      model: STORED_EMBEDDING_MODEL,
      dimensions: STORED_EMBEDDING_DIMENSIONS,
      embed: jest.fn().mockResolvedValue({ vector: compatibleVector }),
      embedText: jest.fn(),
    };
    const { service, prisma } = await buildReindexService(provider);

    await service.reindexProduct('product-1');

    expect(prisma.productEmbedding.upsert).toHaveBeenCalledWith({
      where: { productId: 'product-1' },
      create: { productId: 'product-1', model: EmbeddingModel.HASHING_V1 },
      update: { model: EmbeddingModel.HASHING_V1 },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      { op: 'upsert' },
      { op: 'execute' },
    ]);
  });

  it('rejects product reindexing when the provider declares a different dimension count', async () => {
    const provider: EmbeddingProvider = {
      model: STORED_EMBEDDING_MODEL,
      dimensions: STORED_EMBEDDING_DIMENSIONS + 1,
      embed: jest.fn().mockResolvedValue({ vector: compatibleVector }),
      embedText: jest.fn(),
    };
    const { service, prisma } = await buildReindexService(provider);

    await expect(service.reindexProduct('product-1')).rejects.toThrow(
      'provider declares',
    );
    expect(prisma.productEmbedding.upsert).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects product reindexing when the vector has non-finite values', async () => {
    const provider: EmbeddingProvider = {
      model: STORED_EMBEDDING_MODEL,
      dimensions: STORED_EMBEDDING_DIMENSIONS,
      embed: jest.fn().mockResolvedValue({
        vector: [Number.NaN, ...compatibleVector.slice(1)],
      }),
      embedText: jest.fn(),
    };
    const { service } = await buildReindexService(provider);

    await expect(service.reindexProduct('product-1')).rejects.toThrow(
      'non-finite',
    );
  });
});

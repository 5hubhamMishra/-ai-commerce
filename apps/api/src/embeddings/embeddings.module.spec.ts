import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { EmbeddingModel } from '@prisma/client';
import { PrismaModule } from '../prisma/prisma.module';
import { EmbeddingsModule } from './embeddings.module';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from './providers/embedding-provider.interface';

describe('EmbeddingsModule provider selection', () => {
  async function resolveProvider(provider: string) {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [() => ({ embeddings: { provider } })],
        }),
        PrismaModule,
        EmbeddingsModule,
      ],
    }).compile();

    return module.get<EmbeddingProvider>(EMBEDDING_PROVIDER);
  }

  it('selects the hosted adapter when configured', async () => {
    await expect(resolveProvider('openai')).resolves.toMatchObject({
      model: EmbeddingModel.OPENAI_TEXT_EMBEDDING_3_SMALL,
    });
  });

  it('keeps hashing as the default and for unknown values', async () => {
    await expect(resolveProvider('hashing')).resolves.toMatchObject({
      model: EmbeddingModel.HASHING_V1,
    });
    await expect(resolveProvider('unexpected')).resolves.toMatchObject({
      model: EmbeddingModel.HASHING_V1,
    });
  });
});

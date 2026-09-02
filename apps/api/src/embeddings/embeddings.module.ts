import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from './embeddings.service';
import { HashingEmbeddingAdapter } from './providers/hashing-embedding.adapter';
import { OpenAIEmbeddingAdapter } from './providers/openai-embedding.adapter';
import { EMBEDDING_PROVIDER } from './providers/embedding-provider.interface';

@Module({
  providers: [
    HashingEmbeddingAdapter,
    OpenAIEmbeddingAdapter,
    {
      provide: EMBEDDING_PROVIDER,
      useFactory: (
        config: ConfigService,
        hashing: HashingEmbeddingAdapter,
        openai: OpenAIEmbeddingAdapter,
      ) =>
        config.get<string>('embeddings.provider') === 'openai'
          ? openai
          : hashing,
      inject: [ConfigService, HashingEmbeddingAdapter, OpenAIEmbeddingAdapter],
    },
    EmbeddingsService,
  ],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}

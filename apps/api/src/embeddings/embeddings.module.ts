import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { HashingEmbeddingAdapter } from './providers/hashing-embedding.adapter';
import { EMBEDDING_PROVIDER } from './providers/embedding-provider.interface';

@Module({
  providers: [
    HashingEmbeddingAdapter,
    { provide: EMBEDDING_PROVIDER, useExisting: HashingEmbeddingAdapter },
    EmbeddingsService,
  ],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}

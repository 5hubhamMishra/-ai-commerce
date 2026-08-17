import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheService } from './cache.service';
import { REDIS_CLIENT } from './cache.tokens';

/**
 * Redis-backed read cache — never the source of truth (spec: "Never use Redis as the
 * permanent source of truth for critical commerce state"). Global so any module can
 * inject CacheService without re-importing this module everywhere.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(config.get<string>('redis.url') ?? 'redis://localhost:6379', {
          maxRetriesPerRequest: 2,
          retryStrategy: (times: number) => Math.min(times * 200, 2000),
        }),
    },
    CacheService,
  ],
  exports: [CacheService],
})
export class CacheModule {}

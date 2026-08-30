import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './cache.tokens';

/**
 * Thin cache wrapper. Every method fails open (logs and returns/no-ops on Redis
 * error) — a cache outage must degrade to "always miss", never break a request.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private lastRedisWarningAt = 0;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis | null) {
    if (!this.redis) return;
    this.redis.on('error', (error) => {
      this.warnRedis(`Redis connection failed: ${error.message}`);
    });
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      this.warnRedis(`Cache read failed for "${key}": ${errorMessage(error)}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.warnRedis(`Cache write failed for "${key}": ${errorMessage(error)}`);
    }
  }

  /** Deletes every key under a prefix via non-blocking SCAN — never KEYS (blocks Redis). */
  async delByPrefix(prefix: string): Promise<void> {
    if (!this.redis) return;
    try {
      let cursor = '0';
      const keysToDelete: string[] = [];
      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          `${prefix}*`,
          'COUNT',
          100,
        );
        cursor = nextCursor;
        keysToDelete.push(...keys);
      } while (cursor !== '0');
      if (keysToDelete.length > 0) {
        await this.redis.del(...keysToDelete);
      }
    } catch (error) {
      this.warnRedis(
        `Cache invalidation failed for prefix "${prefix}": ${errorMessage(error)}`,
      );
    }
  }

  private warnRedis(message: string) {
    if (Date.now() - this.lastRedisWarningAt < 30_000) return;
    this.lastRedisWarningAt = Date.now();
    this.logger.warn(message);
  }

  async onModuleDestroy() {
    await this.redis?.quit();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import {
  type AggregateJobData,
  BEHAVIORAL_QUEUE_NAME,
} from './behavioral-queue.tokens';

/**
 * The producer side of the real "event queue" the spec asks for (PROMPT 07 —
 * previously stood in for by an in-process EventEmitter2 bus per ADR-010,
 * which explicitly named "Phase 6+" as when a genuine queue would arrive).
 * BullMQ (Redis-backed) rather than a hand-rolled Postgres poller — Redis is
 * already a first-class dependency of this stack (CacheService), and
 * BullMQ gives real retry/backoff/at-least-once delivery semantics instead
 * of reinventing them. Uses its own dedicated Redis connection, never
 * CacheService's — BullMQ's blocking operations shouldn't share a
 * connection with regular cache traffic (BullMQ's own documented guidance).
 * The consumer side is `BehavioralAggregationWorker` — kept in the same
 * `apps/api` process for now rather than split into a separate `apps/worker`
 * deployable, a deliberate, documented scope decision (see DECISIONS.md).
 */
@Injectable()
export class BehavioralQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BehavioralQueueService.name);
  private lastRedisWarningAt = 0;
  private connection!: IORedis;
  private queue!: Queue<AggregateJobData>;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('redis.url');
    if (!url) return;
    this.connection = new IORedis(url, { maxRetriesPerRequest: null });
    this.connection.on('error', (error) => {
      if (Date.now() - this.lastRedisWarningAt < 30_000) return;
      this.lastRedisWarningAt = Date.now();
      this.logger.warn(`Redis queue connection failed: ${error.message}`);
    });
    this.queue = new Queue<AggregateJobData>(BEHAVIORAL_QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      },
    });
  }

  async onModuleDestroy() {
    await this.queue?.close();
    this.connection?.disconnect();
  }

  /** Never throws into the caller's request — a queue outage shouldn't turn
   *  into a failed event-collection request; the event itself is already
   *  durably written to Postgres by the time this runs (see
   *  EventsService.track), so aggregation can always be recomputed/retried
   *  later without losing the underlying data. */
  async enqueue(data: AggregateJobData): Promise<void> {
    if (!this.queue) return;
    try {
      await this.queue.add('aggregate', data, { jobId: data.eventId });
    } catch (error) {
      this.logger.warn(
        `Failed to enqueue aggregation for event ${data.eventId}: ${String(error)}`,
      );
    }
  }
}

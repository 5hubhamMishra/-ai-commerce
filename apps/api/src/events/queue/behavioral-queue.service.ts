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
import { PrismaService } from '../../prisma/prisma.service';

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

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const url = this.config.get<string>('redis.url');
    if (!url) return;
    this.connection = new IORedis(url, { maxRetriesPerRequest: null });
    this.connection.on('error', (error) => {
      this.warnRedis(`Redis queue connection failed: ${error.message}`);
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
      this.warnRedis(
        `Failed to enqueue aggregation for event ${data.eventId}: ${String(error)}`,
      );
    }
  }

  /** Requeues durable events whose original enqueue happened during a Redis outage. */
  async enqueuePending(limit = 1000): Promise<number> {
    // ponytail: replay 1,000 per cron run; add cursor pagination if backlog volume outgrows drain capacity.
    if (!this.queue) return 0;

    // Declared outside the try block, not `const` inside it - the catch block below reports
    // how many were found even when addBulk (not findMany) is what throws, and a try-scoped
    // `const` isn't visible from its own catch (confirmed at runtime, not just by inspection:
    // referencing it from catch throws "pending is not defined", masking the real error).
    let pending: { id: string }[] = [];
    try {
      pending = await this.prisma.behavioralEvent.findMany({
        where: { processedAt: null },
        orderBy: { receivedAt: 'asc' },
        take: limit,
        select: { id: true },
      });
      if (pending.length === 0) return 0;

      await this.queue.addBulk(
        pending.map(({ id }) => ({
          name: 'aggregate',
          data: { eventId: id },
          opts: { jobId: id },
        })),
      );
      return pending.length;
    } catch (error) {
      this.warnRedis(
        `Failed to requeue ${pending.length} pending behavioral events: ${String(error)}`,
      );
      return 0;
    }
  }

  private warnRedis(message: string) {
    if (Date.now() - this.lastRedisWarningAt < 30_000) return;
    this.lastRedisWarningAt = Date.now();
    this.logger.warn(message);
  }
}

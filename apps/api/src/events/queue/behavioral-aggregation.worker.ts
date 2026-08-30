import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { CustomerProfileService } from '../customer-profile.service';
import {
  type AggregateJobData,
  BEHAVIORAL_QUEUE_NAME,
} from './behavioral-queue.tokens';

/**
 * The consumer side of the behavioral-aggregation queue. Runs in-process
 * inside `apps/api` for now rather than as a separate `apps/worker`
 * deployable — a BullMQ `Worker` just needs a Redis connection, so this can
 * be lifted into its own process later with zero change to the job
 * contract (see DECISIONS.md). `concurrency: 5` bounds how many events are
 * aggregated in parallel; retries/backoff are configured on the producer
 * side (BehavioralQueueService's defaultJobOptions).
 */
@Injectable()
export class BehavioralAggregationWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BehavioralAggregationWorker.name);
  private lastRedisWarningAt = 0;
  private connection!: IORedis;
  private worker!: Worker<AggregateJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly customerProfiles: CustomerProfileService,
  ) {}

  onModuleInit() {
    const url = this.config.get<string>('redis.url');
    // Vercel's cron handler owns a bounded worker for each invocation. Starting
    // this continuous worker there would create a second consumer in the same
    // function instance and keep a serverless invocation alive unnecessarily.
    if (!url || process.env.VERCEL === '1') return;
    this.connection = new IORedis(url, { maxRetriesPerRequest: null });
    this.connection.on('error', (error) => {
      if (Date.now() - this.lastRedisWarningAt < 30_000) return;
      this.lastRedisWarningAt = Date.now();
      this.logger.warn(`Redis worker connection failed: ${error.message}`);
    });
    this.worker = new Worker<AggregateJobData>(
      BEHAVIORAL_QUEUE_NAME,
      (job: Job<AggregateJobData>) =>
        this.customerProfiles.applyEvent(job.data.eventId),
      { connection: this.connection, concurrency: 5 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.warn(
        `Aggregation job for event ${job?.data.eventId} failed: ${error.message}`,
      );
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}

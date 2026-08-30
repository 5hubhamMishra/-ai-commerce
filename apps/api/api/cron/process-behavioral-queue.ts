import type { IncomingMessage, ServerResponse } from 'http';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
// Compiled output, same reasoning as api/index.ts: esbuild (Vercel's function bundler)
// doesn't implement `emitDecoratorMetadata`, which NestJS's DI needs. Importing from
// dist/ (real tsc output) sidesteps it entirely.
import { AppModule } from '../../dist/src/app.module';
import { CustomerProfileService } from '../../dist/src/events/customer-profile.service';
import {
  type AggregateJobData,
  BEHAVIORAL_QUEUE_NAME,
} from '../../dist/src/events/queue/behavioral-queue.tokens';
import { isAuthorizedCronRequest } from '../../src/common/cron-auth';

/**
 * `BehavioralAggregationWorker` (src/events/queue/behavioral-aggregation.worker.ts) is a
 * continuous BullMQ `Worker` — it opens a blocking Redis connection in `onModuleInit` and
 * keeps consuming jobs for the app's entire lifetime. That's fundamentally incompatible
 * with Vercel Functions: an invocation is request-scoped and gets frozen/torn down once
 * its response is sent, so a background polling loop started in one invocation can't
 * keep running to serve jobs enqueued by a *later*, unrelated invocation.
 *
 * This is the serverless-compatible replacement: a Vercel Cron job (see vercel.json)
 * hits this endpoint on a schedule, and for the duration of *this one invocation* it runs
 * a real BullMQ Worker to drain whatever's currently waiting, then closes it and returns.
 * Same job-processing logic as the original (`CustomerProfileService.applyEvent`, reused
 * via NestJS's DI rather than reimplemented — not the lighter option, but zero risk of
 * drifting from the tested original), different lifecycle: near-real-time (bounded by the
 * cron interval) instead of push-based real-time. `BehavioralQueueService` (the producer
 * side, src/events/queue/behavioral-queue.service.ts) is unaffected — enqueueing a job is
 * a single Redis write, not a continuous connection, and works from any request-scoped
 * function exactly as it already does today.
 */
const DRAIN_WINDOW_MS = 45_000; // stays under this function's configured maxDuration

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Vercel signs cron-triggered requests with this header when CRON_SECRET is set —
  // without this check, the endpoint would be a public, unauthenticated way to force
  // Redis/DB load, since app.setGlobalPrefix's route table doesn't cover this path at all.
  const authHeader = req.headers['authorization'];
  if (!isAuthorizedCronRequest(authHeader, process.env.CRON_SECRET)) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        processed: 0,
        failed: 0,
        skipped: 'redis_unconfigured',
      }),
    );
    return;
  }

  const appContext = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const customerProfiles = appContext.get(CustomerProfileService);
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

    let processed = 0;
    let failed = 0;
    const worker = new Worker<AggregateJobData>(
      BEHAVIORAL_QUEUE_NAME,
      async (job) => {
        await customerProfiles.applyEvent(job.data.eventId);
        processed++;
      },
      { connection, concurrency: 5 },
    );
    worker.on('failed', () => {
      failed++;
    });

    await new Promise((resolve) => setTimeout(resolve, DRAIN_WINDOW_MS));
    await worker.close();
    await connection.quit();

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ processed, failed }));
  } finally {
    await appContext.close();
  }
}
